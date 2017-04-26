/**
 * Copyright 2015-present Oculus VR, LLC. All Rights Reserved.
 *
 * This module provides a single function for shallow-rendering and diffing two
 * React components. The idea is that basic snapshotting, while great for small
 * components that don't change frequently, doesn't scale well to large
 * components or components that change frequently (since the snapshots tend to
 * be brittle, breaking due to unrelated changes somewhere else in the
 * component). Shallow rendering helps this somewhat but doesn't obviate the
 * problem entirely. Instead, it would be better to create snapshots that only
 * contain DOM changes relative to some baseline rendering.
 *
 * For example, if you wanted to test that <MyButton disabled={true}/> properly
 * grayed out the text and icon inside, with Jest you could do something like:
 *
 *   expect(diffReact(
 *     <MyButton />,
 *     <MyButton disabled={true} />,
 *   )).toMatchSnapshot();
 *
 * This would then create a minimal diff snapshot that you could test against,
 * higlighting only the relevant changes and their context:
 *
 *    <Button …=…
 *   -   disabled={false}
 *   +   disabled={true}
 *    >
 *      <Image …=…
 *        style={
 *          Object {
 *   -        "tintColor": "#eee",
 *   +        "tintColor": "#666",
 *          }
 *        }
 *      />
 *      <Text …=…
 *        style={
 *          Object {
 *   -        "color": "#eee",
 *   +        "color": "#666",
 *          }
 *        }
 *      >…</Text>
 *    </Button>
 *
 * How does this module work? Well, from a high-level perspective:
 *   1. diffReact() receives two React elements and an optional canonicalization
 *      function.
 *   2. Using Jest's shallow renderer, it renders the elements one-level deep.
 *   3. virtualizeTree() then takes each shallowly-rendered tree and recursively
 *      converts each node into virtual-dom VNode, VText or SENTINEL_NULL_VNODE.
 *      As we traverse each node, we also canizalize the props to ignore certain
 *      irrelevant changes later (e.g. non-rendering on* handler props).
 *   4. virtual-dom's diff() then performs a diff on the two canonicalized,
 *      VNode-based trees, returning basically a POJO that maps numeric in-order
 *      traversal node indices to patches (e.g. insert/remove/replace/change
 *      props/reorder operations).
 *   5. serializePatchesRecursively() recurses over the original in-order
 *      building a serialized diff as it goes based on the original VNode tree
 *      and the patch map:
 *      a. For VTEXT and VNODE patches (which represent node replacements),
 *         serializeTree(), a simplified version of serializePatchesRecursively)
 *         that takes a VNode tree (without patches), an indent level, and
 *         a modification prefix (e.g. '+'/'-') and returns a the tree rendered
 *         with those params, is used to render the before node (with '-') and
 *         the after node (with '+').
 *      b. For PROPS patches (which represent props changes), iterate over the
 *         list of combined props from the original VNode and the patch, and
 *         serialize each one:
 *         i. For props that are equal, combine them all into a single '…=…'
 *            prop.
 *         ii. For primitives that differ, print the before prop with a '-'
 *            prefix before each line and the after prop with a '+' prefix.
 *         iii. For arrays, objects, and React trees (all of which can be
 *            complex), serialize the values with with prettyFormat and run a
 *            text diff on them. In order to provide shorter diffs than just
 *            entire before prop and the entire after prop,
 *            formatArrayOrObjectPropDiff collapses equal chunks of text to '…'.
 *      c. For INSERT patches, serialize the patch.patch with serializeTree()
 *         and add it to the end of the children array with '+' prefixes. If the
 *         node was actually inserted in the middle of a list, we should expect
 *         an ORDER patch to follow, which will move it into the right location.
 *      d. For REMOVE patches, serialize the node in-place using serializeTree()
 *         and '-' prefixes.
 *      e. For ORDER patches (which represent children being reordered)... it's
 *         probably best explained by looking at the code directly.
 *
 * This module also does some things like collapse all the children to '…' if
 * they're all equal and try to keep props on the same line as the start tag in
 * serializeTree() if possible, but that covers the vast majority of this
 * module's complexity.
 *
 * @flow
 */

import React from 'react';
import ReactShallowRenderer from 'react-test-renderer/shallow';
import {diff, VNode, VText} from 'virtual-dom';
import {diffLines} from 'diff';
import flatten from 'flatten';
import invariant from 'invariant';
import isEmptyObject from 'is-empty-object';
import prettyFormat from 'pretty-format';
import reactElementPlugin from 'pretty-format/build/plugins/ReactElement';

// React types.
type FalseyElement = null | false;
type Props = {
  [key: string]: any,
  children?: Array<React.Element<any> | string | FalseyElement>,
};

// The output of ReactShallowRenderer's shallow render of a React tree.
export type RenderedReactElement =
  | string
  | FalseyElement
  | {
      key: ?string,
      props: {
        [key: string]: any,
        children?: Array<RenderedReactElement | string | FalseyElement>,
      },
      type: string | ReactClass<any> | ((props: Props) => React.Element<any>),
    };

// virtual-dom types.
const PatchTypes = {
  NONE: 0, // Irrelevant.
  VTEXT: 1,
  VNODE: 2,
  WIDGET: 3, // Irrelevant.
  PROPS: 4,
  ORDER: 5,
  INSERT: 6,
  REMOVE: 7,
  THUNK: 8, // Irrelevant.
};
type Patch = {
  patch: VNode,
  path: string, // We add this after virtual-dom has performed its diff.
  type: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, // Corresponds to PatchTypes.
  vNode: VNode,
};
type PatchMap = {
  [inOrderRecursionVNodeIndex: number]: Patch | Array<Patch>,
  a: VNode,
};

// diffReact types.
export type CanonicalizePropFn = (
  renderedElement: RenderedReactElement,
  prop: string,
  value: mixed,
) => mixed;
export type CanonicalizePropsFn = (
  renderedElement: RenderedReactElement,
  props: Object,
  defaultCanonicalizePropFn: CanonicalizePropFn,
) => Object;
type Prefix = ' ' | '+' | '-' | 'm';
type SerializedDiff = {
  hasDiffs: boolean,
  serialized: string | null,
};

// In canonicalize(), we'll want to replace all handler props with references
// to the same function so that virtual-dom doesn't identify them as different
// (since we really only want a diff of the visual props).
const SENTINEL_HANDLER = () => {};

// While Jest's shallow renderer does preserve falsey children (allowing us to
// see when a conditionally-rendered element was not rendered), virtual-dom
// doesn't know how to handle them. In order to preserve identity when unkeyed
// conditionally-rendered elements are added and removed, e.g.:
//
//  <View name="a">   ->  null              (removed)
//  <Image name="b">  ->  <Image name="b">  (unchanged)
//
// ... instead of:
//
//  <View name="a">  ->  <Image name="b">  (replaced)
//  <View name="b">  ->  [undefined]       (removed)
//
// ... we need to replace falsey children with some sort of virtual-dom-friendly
// sentinel value that we can strip out later:
//
//  <View name="a">   ->  <Null/>           (replaced with sentinel null)
//  <Image name="b">  ->  <Image name="b">  (unchanged)
//
const SENTINEL_NULL_VNODE = new VNode('[Null]');

// The maximum number of chars we allow on a start tag line in serializeTree()
// before we choose to put the props on next lines instead of the same line as
// the start tag.
const MAX_CHARS_TO_INLINE_PROPS = 100;

// Performs a shallow render of the elements passed in, canonicalizes them with
// the optional canonicalization function, and diffs the results, collapsing
// equal props and trees as much as possible to only highlight the minimal
// amount of detail needed to represent a change.
export default function diffReact(
  base: React.Element<any> | FalseyElement,
  test: React.Element<any> | FalseyElement,
  canonicalizePropsFn?: CanonicalizePropsFn = canonicalizeProps,
): string {
  const baseRenderer = new ReactShallowRenderer();
  baseRenderer.render(base);
  const renderedBase = baseRenderer.getRenderOutput();

  const testRenderer = new ReactShallowRenderer();
  testRenderer.render(test);
  const renderedTest = testRenderer.getRenderOutput();

  const patchMap = diff(
    virtualizeTree(renderedBase, canonicalizePropsFn),
    virtualizeTree(renderedTest, canonicalizePropsFn),
  );
  const {hasDiffs, serialized} = serializeTreeWithPatches(patchMap);
  return hasDiffs && serialized ? serialized : '(No visual differences)';
}

// Converts the result of a shallow render of the specified tree into virtual-
// dom-friendly data structures, canonicalizing the props as it goes.
function virtualizeTree(
  renderedElement: RenderedReactElement,
  canonicalizePropsFn: CanonicalizePropsFn,
): VNode | string | SENTINEL_NULL_VNODE {
  if (!renderedElement) {
    return SENTINEL_NULL_VNODE;
  } else if (typeof renderedElement === 'string') {
    return new VText(renderedElement);
  }

  const {children, ...propsExceptChildren} = renderedElement.props;
  return new VNode(
    typeof renderedElement.type === 'string'
      ? renderedElement.type // This is a native element, e.g. "View".
      : renderedElement.type.displayName ||
          renderedElement.type.name ||
          'Unknown',
    canonicalizePropsFn(renderedElement, propsExceptChildren, canonicalizeProp),
    children &&
      flatten([children]).map(child =>
        virtualizeTree(child, canonicalizePropsFn),
      ),
    renderedElement.key,
  );
}

// Canonicalizes all of the props of an object using the specified
// canonicalization function (defaults to canonicalizeProp). Props that have
// undefined values after canonicalization will be removed entirely.
function canonicalizeProps(
  renderedElement: RenderedReactElement,
  props: Object,
  defaultCanonicalizePropFn: CanonicalizePropFn,
): Object {
  const newProps = {};
  for (const prop in props) {
    const newValue = defaultCanonicalizePropFn(
      renderedElement,
      prop,
      props[prop],
    );
    if (newValue !== undefined) {
      newProps[prop] = newValue;
    }
  }
  return newProps;
}

// Canonicalizes a single prop according to the following cases:
//   - on* function props are all replaced with a single function, since it is
//     fairly safe to assume that they are event handlers, which don't affect
//     rendering. If that is not the case, the user can always pass a custom
//     canonicalization function to diffReact directly.
//   - arrays and objects are recursively canonicalized to catch any nested
//     event handlers.
function canonicalizeProp(
  renderedElement: RenderedReactElement,
  prop: string,
  value: mixed,
): mixed {
  // TODO(who): Add back support for StyleSheet.flatten() for style props.
  if (prop && typeof value === 'function' && prop.substr(0, 2) === 'on') {
    return SENTINEL_HANDLER;
  } else if (Array.isArray(value)) {
    return value.map((item, ii) =>
      canonicalizeProp(renderedElement, `${prop}[${ii}]`, item),
    );
  } else if (value instanceof Object) {
    const canonicalizedValue = {};
    for (const key in value) {
      canonicalizedValue[key] = canonicalizeProp(
        renderedElement,
        `${prop}.${key}`,
        value[key],
      );
    }
    return canonicalizedValue;
  }
  return value;
}

// Non-recursive wrapper for serializeTreeWithPatchesRecursively.
function serializeTreeWithPatches(patchMap: PatchMap): SerializedDiff {
  return serializeTreeWithPatchesRecursively(
    0,
    false,
    '',
    patchMap.a,
    patchMap,
  );
}

// Serializes a tree with an in-order recursive traversal, making diff-style
// modifications according to the specified virtual-dom-created patch map. This
// is the core of this module's serialization logic.
function serializeTreeWithPatchesRecursively(
  index: number,
  wasMoved: boolean,
  indent: string,
  baseVNode: VNode | VText | SENTINEL_NULL_VNODE,
  patchMap: PatchMap,
): SerializedDiff {
  const patchOrPatches = patchMap[index] || [];
  const patches: Array<Patch> = Array.isArray(patchOrPatches)
    ? patchOrPatches
    : [patchOrPatches];

  // Handle the case where baseVNode is a text node.
  if (patches.length > 0 && patches[0].type === PatchTypes.VTEXT) {
    return {
      hasDiffs: true,
      serialized: [
        serializeTree('-', indent, baseVNode),
        serializeTree('+', indent, patches[0].patch),
      ].join('\n'),
    };
  } else if (baseVNode instanceof VText && patches.length === 0) {
    return {
      hasDiffs: false,
      serialized: formatLines(' ', indent, '…'),
    };
  }

  // Handle the case where an entire tree has been added/moved/removed.
  for (const patch of patches) {
    switch (patch.type) {
      case PatchTypes.VNODE: {
        invariant(
          patches.length === 1,
          `Did not expect multiple patches when one is a VNODE patch:\n${prettyFormat(patches)}`,
        );
        const diffs = [];
        if (baseVNode !== SENTINEL_NULL_VNODE) {
          diffs.push(serializeTree('-', indent, baseVNode));
        }
        if (patch.patch !== SENTINEL_NULL_VNODE) {
          diffs.push(serializeTree('+', indent, patch.patch));
        }
        return {hasDiffs: true, serialized: diffs.join('\n')};
      }
      case PatchTypes.REMOVE:
        invariant(
          patches.length === 1,
          `Did not expect multiple patches when one is a REMOVE patch:\n${prettyFormat(patches)}`,
        );
        if (baseVNode === SENTINEL_NULL_VNODE) {
          // Removing a falsey node should not be treated as a meaningful diff.
          return {hasDiffs: false, serialized: null};
        } else {
          return {
            hasDiffs: true,
            serialized: serializeTree('-', indent, baseVNode),
          };
        }
      default:
        break;
    }
  }

  // Handle the case where this is a null node but unchanged.
  if (baseVNode === SENTINEL_NULL_VNODE) {
    return {hasDiffs: false, serialized: null};
  }

  // Serialize the start of the start tag.
  let hasDiffs = false;
  let start = formatFirstLine(
    wasMoved ? 'm' : ' ',
    indent,
    `<${baseVNode.tagName}`,
  );
  if (baseVNode.key) {
    start += ` key="${baseVNode.key}"`;
  }

  // Serialize the props by first figuring out the commonalities and differences
  // and serializing them to an array of props lines.
  const propsPatch = patches.find(patch => patch.type === PatchTypes.PROPS);
  const hasDiffProps = Boolean(propsPatch);
  const propsLines = [];
  const baseProps = baseVNode.properties || {};
  const patchProps = (propsPatch && propsPatch.patch) || {};
  let hasEqualProps = false;
  if (hasDiffProps) {
    hasDiffs = true;
    const sortedProps = Object.keys({...baseProps, ...patchProps}).sort();
    for (const prop of sortedProps) {
      if (!(prop in patchProps)) {
        hasEqualProps = true;
        continue;
      }

      const baseValue = baseProps[prop];
      const patchValue = patchProps[prop];
      const isArrayObjectChange =
        baseValue &&
        patchValue &&
        isObject(patchValue) &&
        (Array.isArray(baseValue) || isObject(baseValue));
      if (isArrayObjectChange) {
        propsLines.push(
          formatArrayOrObjectPropDiff(indent, prop, baseValue, patchValue),
        );
      } else {
        if (prop in baseProps) {
          // Prop was removed or changed.
          propsLines.push(formatPropLines('-', indent, prop, baseProps[prop]));
        }
        if (patchProps[prop] !== undefined) {
          // Prop was changed.
          propsLines.push(formatPropLines('+', indent, prop, patchProps[prop]));
        }
      }
    }
  } else if (!isEmptyObject(baseProps)) {
    hasEqualProps = true;
  }

  // Append the array of serialized props lines onto the start tag.
  if (hasEqualProps) {
    start += ' …=…';
  }
  if (propsLines.length > 0) {
    start += [
      '', // Add a newline after the tagName.
      ...propsLines,
      formatLines(wasMoved ? 'm' : ' ', indent, ''), // Prepare for ">".
    ].join('\n');
  }

  // Serialize the children.
  const orderPatch = patches.find(patch => patch.type === PatchTypes.ORDER);
  const movedChildrenKeys = new Set(
    orderPatch ? orderPatch.patch.inserts.map(insert => insert.key) : [],
  );

  let lastIndex = index;
  let hasChildDiffs = false;
  let serializedChildren: Array<string> = [
    ...baseVNode.children.map(child => {
      const {
        hasDiffs: childHasDiffs,
        serialized,
      } = serializeTreeWithPatchesRecursively(
        ++lastIndex,
        movedChildrenKeys.has(child.key),
        `${indent}  `,
        child,
        patchMap,
      );
      lastIndex += child.count;
      hasChildDiffs = hasChildDiffs || childHasDiffs;
      return serialized;
    }),
    ...patches.filter(patch => patch.type === PatchTypes.INSERT).map(patch => {
      if (patch.patch === SENTINEL_NULL_VNODE) {
        // Adding a falsey node should not be treated as a meaningful diff.
        return null;
      }
      hasChildDiffs = true;
      return serializeTree('+', `${indent}  `, patch.patch);
    }),
  ];

  // Handle children reordering by applying the patches specified by virtual-dom
  // in order, starting with the removes.
  if (orderPatch) {
    hasChildDiffs = true;
    const reorderedChildren: Array<{
      removed: boolean,
      serializedChild: string,
    }> = serializedChildren.map(serializedChild => ({
      removed: false,
      serializedChild,
    }));
    const movedChildren = {};
    for (const remove of orderPatch.patch.removes) {
      const ii = indexOfIthNonRemovedItem(reorderedChildren, remove.from);
      if (remove.key === null) {
        reorderedChildren[ii].removed = true;
      } else {
        movedChildren[remove.key] = reorderedChildren.splice(ii, 1)[0];
      }
    }

    for (const insert of orderPatch.patch.inserts) {
      const ii = indexOfIthNonRemovedItem(reorderedChildren, insert.to);
      reorderedChildren.splice(ii, 0, movedChildren[insert.key]);
    }

    serializedChildren = reorderedChildren.map(entry => entry.serializedChild);
  }
  serializedChildren = serializedChildren.filter(child => child !== null);
  hasDiffs = hasDiffs || hasChildDiffs;

  // Serialize the end tag.
  let end = '';
  if (serializedChildren.length === 0) {
    end = '/>';
  } else if (!hasChildDiffs) {
    start += '>…';
    end = `</${baseVNode.tagName}>`;
  } else {
    start += '>\n';
    end = [
      ...serializedChildren,
      formatLines(wasMoved ? 'm' : ' ', indent, `</${baseVNode.tagName}>`),
    ].join('\n');
  }

  return {hasDiffs, serialized: start + end};
}

// Serializes an entire tree recursively. Used by
// serializeTreeWithPatchesRecursively to serialize complete element additions
// and removals, which won't have their props or children collapsed since they
// will never share common (i.e. collapsible) props or children with the
// implicit null element they are either replacing or being replaced by.
function serializeTree(
  prefix: Prefix,
  indent: string,
  vNode: VNode | VText,
): string {
  // Handle the case where vNode is a text node.
  if (vNode instanceof VText) {
    return formatLines(prefix, indent, vNode.text);
  }

  // Serialize the start tag.
  let start = `${prefix} ${indent}<${vNode.tagName}`;
  if (vNode.key) {
    start += ` key="${vNode.key}"`;
  }

  // Serialize the props.
  const props = vNode.properties || {};
  const sortedProps = Object.keys(props).sort();
  if (sortedProps.length > 0) {
    const propsString = sortedProps
      .map(prop => formatProp(prop, props[prop]))
      .join(' ');
    if (
      !propsString.includes('\n') &&
      `${start} ${propsString}/>`.length <= MAX_CHARS_TO_INLINE_PROPS
    ) {
      start += ` ${propsString}`;
    } else {
      start += [
        '', // Add a newline after the tagName (with the .join('\n') below).
        ...sortedProps.map(prop =>
          formatPropLines(prefix, indent, prop, props[prop]),
        ),
        formatLines(prefix, indent, ''), // Prepare for ">".
      ].join('\n');
    }
  }

  // Serialize the children.
  const serializedChildren = [];
  for (const child of vNode.children) {
    serializedChildren.push(serializeTree(prefix, `${indent}  `, child));
  }

  // Serialize the end tag.
  let end = '';
  if (serializedChildren.length === 0) {
    end = '/>';
  } else {
    start += '>\n';
    end = [
      ...serializedChildren,
      formatLines(prefix, indent, `</${vNode.tagName}>`),
    ].join('\n');
  }

  return start + end;
}

function isObject(o: mixed): boolean {
  // Because Javascript is sometimes stupid.
  return Boolean(o) && typeof o === 'object' && !Array.isArray(o);
}

// Formats a single prop diff when the diff is inside an object using a
// standard text-diffing algorithm. This should allow us to significantly
// collapse props diffs inside such props changes.
// TODO(who): Create a separate diff serialization function just for objects
//   that doesn't use string diffing.
// TODO(who): Modify this to use diffReact's core diffing system for React
//   elemens (of course skipping the shallow render).
export function formatArrayOrObjectPropDiff(
  indent: string,
  prop: string,
  baseValue: Array<any> | Object,
  patchValue: {[keyOrIndex: string | number]: any},
): string {
  // First we need to apply the patch to the array or object.
  let testValue = null;
  if (Array.isArray(baseValue)) {
    testValue = [];
    const maxIndex = Math.max.apply(null, [
      baseValue.length - 1,
      ...Object.keys(patchValue).map(index => parseInt(index, 10)),
    ]);
    for (let ii = 0; ii <= maxIndex; ++ii) {
      if (ii in patchValue) {
        if (patchValue[ii] !== undefined) {
          testValue.push(patchValue[ii]);
        }
      } else {
        testValue.push(baseValue[ii]);
      }
    }
  } else {
    testValue = {...baseValue}; // Clone baseValue.
    for (const key in patchValue) {
      if (patchValue[key] === undefined) {
        delete testValue[key];
      } else {
        testValue[key] = patchValue[key];
      }
    }
  }

  // Then diff the serialized values.
  const diffs = diffLines(
    serializeArrayOrObject(baseValue),
    serializeArrayOrObject(testValue),
  );

  // And format the diff data structure as a string.
  const subIndent = `${indent}    `;
  const diffsString = diffs
    .map(({added, removed, value}) => {
      const lines = value.replace(/[\r\n]*$/, '').split('\n');
      if (added || removed) {
        return lines
          .map(line => `${added ? '+ ' : '- '}${subIndent}${line}`)
          .join('\n');
      } else if (lines.length <= 2) {
        return lines.map(line => `  ${subIndent}${line}`).join('\n');
      } else {
        return `  ${subIndent}${lines[0]}\n${subIndent}    …\n  ${subIndent}${lines[lines.length - 1]}`;
      }
    })
    .join('\n');

  return [
    formatLines(' ', `${indent}  `, `${prop}={`),
    diffsString,
    formatLines(' ', `${indent}  `, `}`),
  ].join('\n');
}

function serializeArrayOrObject(value: Array<mixed> | Object): string {
  const serialized = prettyFormat(value, {
    escapeRegex: true,
    plugins: [reactElementPlugin],
    printFunctionName: true,
  });
  return serialized && `${serialized}\n`;
}

// Formats a single prop with a prefix and indent.
function formatPropLines(
  prefix: Prefix,
  indent: string,
  prop: string,
  value: mixed,
): string {
  return formatLines(prefix, `${indent}  `, formatProp(prop, value));
}

// Formats a single prop according to the following rules:
//   ('…', '…') → '…=…' (special case)
//   (<prop>, <string>) → '<prop>="<string>"'
//   (<prop>, null) → '<prop>={null}'
//   (<prop>, undefined) → '<prop>={undefined}'
//   (<prop>, <number>) → '<prop>={<number>}'
//   (<prop>, <boolean>) → '<prop>={<boolean>}'
//   (<prop>, <regex>) → '<prop>={<regex>}'
//   (<prop>, <function>) → '<prop>={[Function <function name]}'
//   (<prop>, <multiline string> → '<prop>="<line 1>\n<line 2>\n<line 3>"'
//   (<prop>, <array> → '<prop>={
//     Array [
//       <item 1>
//       <item 2>
//       <item 3>
//     ]
//   }'
//   (<prop>, <object> → '<prop>={
//     Object {
//       <key 1>: <value 1>
//       <key 2>: <value 2>
//       <key 3>: <value 3>
//     }
//   }'
function formatProp(prop: string, value: mixed): string {
  let prettyValue = '';
  if (value === '…') {
    prettyValue = '…';
  } else if (typeof value === 'string') {
    prettyValue = `${value.replace(/\n/g, '\\n').replace(/"/g, '\\"')}`;
  } else {
    prettyValue = prettyFormat(value, {escapeRegex: true});
  }

  let lines = prettyValue.split('\n');
  if (lines.length === 1) {
    if (typeof value === 'string') {
      lines = [`"${prettyValue}"`];
    } else {
      lines = [`{${prettyValue}}`];
    }
  } else {
    lines = ['{', ...lines.map(line => `  ${line}`), '}'];
  }
  return `${prop}=${lines.join('\n')}`;
}

// Takes a string and adds line prefixes and indentation to every line.
function formatLines(prefix: Prefix, indent: string, value: string): string {
  return value
    .split('\n')
    .map(line => formatFirstLine(prefix, indent, line))
    .join('\n');
}

// Takes a string and adds a prefix and indentation to the first line.
function formatFirstLine(
  prefix: Prefix,
  indent: string,
  value: string,
): string {
  return `${prefix} ${indent}${value}`;
}

// We need this function because the virtual-dom differ creates a patch that is
// expected to be applied incrementally, meaning the index for an insert or
// remove operation might be pointing at a different element after prior
// children have been removed. In our case, where we want to print the child
// that was removed with '-' line prefixes in our diff, we actually need to keep
// them in the array. This function transforms the index virtual-dom gives us
// (which ignores removed children, because they've been removed from the array)
// to the index for the same item in our array (where we haven't actually
// removed certain children).
export function indexOfIthNonRemovedItem(
  a: Array<{removed: boolean, serializedChild: string}>,
  ii: number,
): number {
  let indexIgnoringRemovedItems = 0;
  for (let jj = 0; jj < a.length; ++jj) {
    if (!a[jj].removed) {
      if (indexIgnoringRemovedItems === ii) {
        return jj;
      }
      ++indexIgnoringRemovedItems;
    }
  }
  return a.length;
}
