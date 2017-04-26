'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports.default = diffReact;
exports.formatArrayOrObjectPropDiff = formatArrayOrObjectPropDiff;
exports.indexOfIthNonRemovedItem = indexOfIthNonRemovedItem;

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactAddonsTestUtils = require('react-addons-test-utils');

var _reactAddonsTestUtils2 = _interopRequireDefault(_reactAddonsTestUtils);

var _virtualDom = require('virtual-dom');

var _diff = require('diff');

var _flatten = require('flatten');

var _flatten2 = _interopRequireDefault(_flatten);

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _isEmptyObject = require('is-empty-object');

var _isEmptyObject2 = _interopRequireDefault(_isEmptyObject);

var _prettyFormat = require('pretty-format');

var _prettyFormat2 = _interopRequireDefault(_prettyFormat);

var _ReactElement = require('pretty-format/build/plugins/ReactElement');

var _ReactElement2 = _interopRequireDefault(_ReactElement);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; } /**
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
                                                                                                                                                                                                                              * 
                                                                                                                                                                                                                              */

// virtual-dom types.


// React types.


// The output of ReactTestUtils's shallow render of a React tree.
var PatchTypes = {
  NONE: 0, // Irrelevant.
  VTEXT: 1,
  VNODE: 2,
  WIDGET: 3, // Irrelevant.
  PROPS: 4,
  ORDER: 5,
  INSERT: 6,
  REMOVE: 7,
  THUNK: 8 };

// diffReact types.


// In canonicalize(), we'll want to replace all handler props with references
// to the same function so that virtual-dom doesn't identify them as different
// (since we really only want a diff of the visual props).
var SENTINEL_HANDLER = function SENTINEL_HANDLER() {};

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
var SENTINEL_NULL_VNODE = new _virtualDom.VNode('[Null]');

// The maximum number of chars we allow on a start tag line in serializeTree()
// before we choose to put the props on next lines instead of the same line as
// the start tag.
var MAX_CHARS_TO_INLINE_PROPS = 100;

// Performs a shallow render of the elements passed in, canonicalizes them with
// the optional canonicalization function, and diffs the results, collapsing
// equal props and trees as much as possible to only highlight the minimal
// amount of detail needed to represent a change.
function diffReact(base, test) {
  var canonicalizePropsFn = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : canonicalizeProps;

  var baseRenderer = _reactAddonsTestUtils2.default.createRenderer();
  baseRenderer.render(base);
  var renderedBase = baseRenderer.getRenderOutput();

  var testRenderer = _reactAddonsTestUtils2.default.createRenderer();
  testRenderer.render(test);
  var renderedTest = testRenderer.getRenderOutput();

  var patchMap = (0, _virtualDom.diff)(virtualizeTree(renderedBase, canonicalizePropsFn), virtualizeTree(renderedTest, canonicalizePropsFn));

  var _serializeTreeWithPat = serializeTreeWithPatches(patchMap),
      hasDiffs = _serializeTreeWithPat.hasDiffs,
      serialized = _serializeTreeWithPat.serialized;

  return hasDiffs && serialized ? serialized : '(No visual differences)';
}

// Converts the result of a shallow render of the specified tree into virtual-
// dom-friendly data structures, canonicalizing the props as it goes.
function virtualizeTree(renderedElement, canonicalizePropsFn) {
  if (!renderedElement) {
    return SENTINEL_NULL_VNODE;
  } else if (typeof renderedElement === 'string') {
    return new _virtualDom.VText(renderedElement);
  }

  var _renderedElement$prop = renderedElement.props,
      children = _renderedElement$prop.children,
      propsExceptChildren = _objectWithoutProperties(_renderedElement$prop, ['children']);

  return new _virtualDom.VNode(typeof renderedElement.type === 'string' ? renderedElement.type // This is a native element, e.g. "View".
  : renderedElement.type.displayName || renderedElement.type.name || 'Unknown', canonicalizePropsFn(renderedElement, propsExceptChildren, canonicalizeProp), children && (0, _flatten2.default)([children]).map(function (child) {
    return virtualizeTree(child, canonicalizePropsFn);
  }), renderedElement.key);
}

// Canonicalizes all of the props of an object using the specified
// canonicalization function (defaults to canonicalizeProp). Props that have
// undefined values after canonicalization will be removed entirely.
function canonicalizeProps(renderedElement, props, defaultCanonicalizePropFn) {
  var newProps = {};
  for (var _prop in props) {
    var newValue = defaultCanonicalizePropFn(renderedElement, _prop, props[_prop]);
    if (newValue !== undefined) {
      newProps[_prop] = newValue;
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
function canonicalizeProp(renderedElement, prop, value) {
  // TODO(who): Add back support for StyleSheet.flatten() for style props.
  if (prop && typeof value === 'function' && prop.substr(0, 2) === 'on') {
    return SENTINEL_HANDLER;
  } else if (Array.isArray(value)) {
    return value.map(function (item, ii) {
      return canonicalizeProp(renderedElement, prop + '[' + ii + ']', item);
    });
  } else if (value instanceof Object) {
    var canonicalizedValue = {};
    for (var _key in value) {
      canonicalizedValue[_key] = canonicalizeProp(renderedElement, prop + '.' + _key, value[_key]);
    }
    return canonicalizedValue;
  }
  return value;
}

// Non-recursive wrapper for serializeTreeWithPatchesRecursively.
function serializeTreeWithPatches(patchMap) {
  return serializeTreeWithPatchesRecursively(0, false, '', patchMap.a, patchMap);
}

// Serializes a tree with an in-order recursive traversal, making diff-style
// modifications according to the specified virtual-dom-created patch map. This
// is the core of this module's serialization logic.
function serializeTreeWithPatchesRecursively(index, wasMoved, indent, baseVNode, patchMap) {
  var patchOrPatches = patchMap[index] || [];
  var patches = Array.isArray(patchOrPatches) ? patchOrPatches : [patchOrPatches];

  // Handle the case where baseVNode is a text node.
  if (patches.length > 0 && patches[0].type === PatchTypes.VTEXT) {
    return {
      hasDiffs: true,
      serialized: [serializeTree('-', indent, baseVNode), serializeTree('+', indent, patches[0].patch)].join('\n')
    };
  } else if (baseVNode instanceof _virtualDom.VText && patches.length === 0) {
    return {
      hasDiffs: false,
      serialized: formatLines(' ', indent, '…')
    };
  }

  // Handle the case where an entire tree has been added/moved/removed.
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = patches[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _patch = _step.value;

      switch (_patch.type) {
        case PatchTypes.VNODE:
          {
            (0, _invariant2.default)(patches.length === 1, 'Did not expect multiple patches when one is a VNODE patch:\n' + (0, _prettyFormat2.default)(patches));
            var diffs = [];
            if (baseVNode !== SENTINEL_NULL_VNODE) {
              diffs.push(serializeTree('-', indent, baseVNode));
            }
            if (_patch.patch !== SENTINEL_NULL_VNODE) {
              diffs.push(serializeTree('+', indent, _patch.patch));
            }
            return { hasDiffs: true, serialized: diffs.join('\n') };
          }
        case PatchTypes.REMOVE:
          (0, _invariant2.default)(patches.length === 1, 'Did not expect multiple patches when one is a REMOVE patch:\n' + (0, _prettyFormat2.default)(patches));
          if (baseVNode === SENTINEL_NULL_VNODE) {
            // Removing a falsey node should not be treated as a meaningful diff.
            return { hasDiffs: false, serialized: null };
          } else {
            return {
              hasDiffs: true,
              serialized: serializeTree('-', indent, baseVNode)
            };
          }
        default:
          break;
      }
    }

    // Handle the case where this is a null node but unchanged.
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }

  if (baseVNode === SENTINEL_NULL_VNODE) {
    return { hasDiffs: false, serialized: null };
  }

  // Serialize the start of the start tag.
  var hasDiffs = false;
  var start = formatFirstLine(wasMoved ? 'm' : ' ', indent, '<' + baseVNode.tagName);
  if (baseVNode.key) {
    start += ' key="' + baseVNode.key + '"';
  }

  // Serialize the props by first figuring out the commonalities and differences
  // and serializing them to an array of props lines.
  var propsPatch = patches.find(function (patch) {
    return patch.type === PatchTypes.PROPS;
  });
  var hasDiffProps = Boolean(propsPatch);
  var propsLines = [];
  var baseProps = baseVNode.properties || {};
  var patchProps = propsPatch && propsPatch.patch || {};
  var hasEqualProps = false;
  if (hasDiffProps) {
    hasDiffs = true;
    var sortedProps = Object.keys(_extends({}, baseProps, patchProps)).sort();
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = sortedProps[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        var _prop2 = _step2.value;

        if (!(_prop2 in patchProps)) {
          hasEqualProps = true;
          continue;
        }

        var baseValue = baseProps[_prop2];
        var patchValue = patchProps[_prop2];
        var isArrayObjectChange = baseValue && patchValue && isObject(patchValue) && (Array.isArray(baseValue) || isObject(baseValue));
        if (isArrayObjectChange) {
          propsLines.push(formatArrayOrObjectPropDiff(indent, _prop2, baseValue, patchValue));
        } else {
          if (_prop2 in baseProps) {
            // Prop was removed or changed.
            propsLines.push(formatPropLines('-', indent, _prop2, baseProps[_prop2]));
          }
          if (patchProps[_prop2] !== undefined) {
            // Prop was changed.
            propsLines.push(formatPropLines('+', indent, _prop2, patchProps[_prop2]));
          }
        }
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }
  } else if (!(0, _isEmptyObject2.default)(baseProps)) {
    hasEqualProps = true;
  }

  // Append the array of serialized props lines onto the start tag.
  if (hasEqualProps) {
    start += ' …=…';
  }
  if (propsLines.length > 0) {
    start += [''].concat(propsLines, [formatLines(wasMoved ? 'm' : ' ', indent, '')]).join('\n');
  }

  // Serialize the children.
  var orderPatch = patches.find(function (patch) {
    return patch.type === PatchTypes.ORDER;
  });
  var movedChildrenKeys = new Set(orderPatch ? orderPatch.patch.inserts.map(function (insert) {
    return insert.key;
  }) : []);

  var lastIndex = index;
  var hasChildDiffs = false;
  var serializedChildren = [].concat(_toConsumableArray(baseVNode.children.map(function (child) {
    var _serializeTreeWithPat2 = serializeTreeWithPatchesRecursively(++lastIndex, movedChildrenKeys.has(child.key), indent + '  ', child, patchMap),
        childHasDiffs = _serializeTreeWithPat2.hasDiffs,
        serialized = _serializeTreeWithPat2.serialized;

    lastIndex += child.count;
    hasChildDiffs = hasChildDiffs || childHasDiffs;
    return serialized;
  })), _toConsumableArray(patches.filter(function (patch) {
    return patch.type === PatchTypes.INSERT;
  }).map(function (patch) {
    if (patch.patch === SENTINEL_NULL_VNODE) {
      // Adding a falsey node should not be treated as a meaningful diff.
      return null;
    }
    hasChildDiffs = true;
    return serializeTree('+', indent + '  ', patch.patch);
  })));

  // Handle children reordering by applying the patches specified by virtual-dom
  // in order, starting with the removes.
  if (orderPatch) {
    hasChildDiffs = true;
    var reorderedChildren = serializedChildren.map(function (serializedChild) {
      return {
        removed: false,
        serializedChild: serializedChild
      };
    });
    var movedChildren = {};
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = orderPatch.patch.removes[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        var remove = _step3.value;

        var ii = indexOfIthNonRemovedItem(reorderedChildren, remove.from);
        if (remove.key === null) {
          reorderedChildren[ii].removed = true;
        } else {
          movedChildren[remove.key] = reorderedChildren.splice(ii, 1)[0];
        }
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (var _iterator4 = orderPatch.patch.inserts[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
        var insert = _step4.value;

        var _ii = indexOfIthNonRemovedItem(reorderedChildren, insert.to);
        reorderedChildren.splice(_ii, 0, movedChildren[insert.key]);
      }
    } catch (err) {
      _didIteratorError4 = true;
      _iteratorError4 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion4 && _iterator4.return) {
          _iterator4.return();
        }
      } finally {
        if (_didIteratorError4) {
          throw _iteratorError4;
        }
      }
    }

    serializedChildren = reorderedChildren.map(function (entry) {
      return entry.serializedChild;
    });
  }
  serializedChildren = serializedChildren.filter(function (child) {
    return child !== null;
  });
  hasDiffs = hasDiffs || hasChildDiffs;

  // Serialize the end tag.
  var end = '';
  if (serializedChildren.length === 0) {
    end = '/>';
  } else if (!hasChildDiffs) {
    start += '>…';
    end = '</' + baseVNode.tagName + '>';
  } else {
    start += '>\n';
    end = [].concat(_toConsumableArray(serializedChildren), [formatLines(wasMoved ? 'm' : ' ', indent, '</' + baseVNode.tagName + '>')]).join('\n');
  }

  return { hasDiffs: hasDiffs, serialized: start + end };
}

// Serializes an entire tree recursively. Used by
// serializeTreeWithPatchesRecursively to serialize complete element additions
// and removals, which won't have their props or children collapsed since they
// will never share common (i.e. collapsible) props or children with the
// implicit null element they are either replacing or being replaced by.
function serializeTree(prefix, indent, vNode) {
  // Handle the case where vNode is a text node.
  if (vNode instanceof _virtualDom.VText) {
    return formatLines(prefix, indent, vNode.text);
  }

  // Serialize the start tag.
  var start = prefix + ' ' + indent + '<' + vNode.tagName;
  if (vNode.key) {
    start += ' key="' + vNode.key + '"';
  }

  // Serialize the props.
  var props = vNode.properties || {};
  var sortedProps = Object.keys(props).sort();
  if (sortedProps.length > 0) {
    var propsString = sortedProps.map(function (prop) {
      return formatProp(prop, props[prop]);
    }).join(' ');
    if (!propsString.includes('\n') && (start + ' ' + propsString + '/>').length <= MAX_CHARS_TO_INLINE_PROPS) {
      start += ' ' + propsString;
    } else {
      start += [''].concat(_toConsumableArray(sortedProps.map(function (prop) {
        return formatPropLines(prefix, indent, prop, props[prop]);
      })), [formatLines(prefix, indent, '')]).join('\n');
    }
  }

  // Serialize the children.
  var serializedChildren = [];
  var _iteratorNormalCompletion5 = true;
  var _didIteratorError5 = false;
  var _iteratorError5 = undefined;

  try {
    for (var _iterator5 = vNode.children[Symbol.iterator](), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
      var child = _step5.value;

      serializedChildren.push(serializeTree(prefix, indent + '  ', child));
    }

    // Serialize the end tag.
  } catch (err) {
    _didIteratorError5 = true;
    _iteratorError5 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion5 && _iterator5.return) {
        _iterator5.return();
      }
    } finally {
      if (_didIteratorError5) {
        throw _iteratorError5;
      }
    }
  }

  var end = '';
  if (serializedChildren.length === 0) {
    end = '/>';
  } else {
    start += '>\n';
    end = [].concat(serializedChildren, [formatLines(prefix, indent, '</' + vNode.tagName + '>')]).join('\n');
  }

  return start + end;
}

function isObject(o) {
  // Because Javascript is sometimes stupid.
  return Boolean(o) && (typeof o === 'undefined' ? 'undefined' : _typeof(o)) === 'object' && !Array.isArray(o);
}

// Formats a single prop diff when the diff is inside an object using a
// standard text-diffing algorithm. This should allow us to significantly
// collapse props diffs inside such props changes.
// TODO(who): Create a separate diff serialization function just for objects
//   that doesn't use string diffing.
// TODO(who): Modify this to use diffReact's core diffing system for React
//   elemens (of course skipping the shallow render).
function formatArrayOrObjectPropDiff(indent, prop, baseValue, patchValue) {
  // First we need to apply the patch to the array or object.
  var testValue = null;
  if (Array.isArray(baseValue)) {
    testValue = [];
    var maxIndex = Math.max.apply(null, [baseValue.length - 1].concat(_toConsumableArray(Object.keys(patchValue).map(function (index) {
      return parseInt(index, 10);
    }))));
    for (var ii = 0; ii <= maxIndex; ++ii) {
      if (ii in patchValue) {
        if (patchValue[ii] !== undefined) {
          testValue.push(patchValue[ii]);
        }
      } else {
        testValue.push(baseValue[ii]);
      }
    }
  } else {
    testValue = _extends({}, baseValue); // Clone baseValue.
    for (var _key2 in patchValue) {
      if (patchValue[_key2] === undefined) {
        delete testValue[_key2];
      } else {
        testValue[_key2] = patchValue[_key2];
      }
    }
  }

  // Then diff the serialized values.
  var diffs = (0, _diff.diffLines)(serializeArrayOrObject(baseValue), serializeArrayOrObject(testValue));

  // And format the diff data structure as a string.
  var subIndent = indent + '    ';
  var diffsString = diffs.map(function (_ref) {
    var added = _ref.added,
        removed = _ref.removed,
        value = _ref.value;

    var lines = value.replace(/[\r\n]*$/, '').split('\n');
    if (added || removed) {
      return lines.map(function (line) {
        return '' + (added ? '+ ' : '- ') + subIndent + line;
      }).join('\n');
    } else if (lines.length <= 2) {
      return lines.map(function (line) {
        return '  ' + subIndent + line;
      }).join('\n');
    } else {
      return '  ' + subIndent + lines[0] + '\n' + subIndent + '    \u2026\n  ' + subIndent + lines[lines.length - 1];
    }
  }).join('\n');

  return [formatLines(' ', indent + '  ', prop + '={'), diffsString, formatLines(' ', indent + '  ', '}')].join('\n');
}

function serializeArrayOrObject(value) {
  var serialized = (0, _prettyFormat2.default)(value, {
    escapeRegex: true,
    plugins: [_ReactElement2.default],
    printFunctionName: true
  });
  return serialized && serialized + '\n';
}

// Formats a single prop with a prefix and indent.
function formatPropLines(prefix, indent, prop, value) {
  return formatLines(prefix, indent + '  ', formatProp(prop, value));
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
function formatProp(prop, value) {
  var prettyValue = '';
  if (value === '…') {
    prettyValue = '…';
  } else if (typeof value === 'string') {
    prettyValue = '' + value.replace(/\n/g, '\\n').replace(/"/g, '\\"');
  } else {
    prettyValue = (0, _prettyFormat2.default)(value, { escapeRegex: true });
  }

  var lines = prettyValue.split('\n');
  if (lines.length === 1) {
    if (typeof value === 'string') {
      lines = ['"' + prettyValue + '"'];
    } else {
      lines = ['{' + prettyValue + '}'];
    }
  } else {
    lines = ['{'].concat(_toConsumableArray(lines.map(function (line) {
      return '  ' + line;
    })), ['}']);
  }
  return prop + '=' + lines.join('\n');
}

// Takes a string and adds line prefixes and indentation to every line.
function formatLines(prefix, indent, value) {
  return value.split('\n').map(function (line) {
    return formatFirstLine(prefix, indent, line);
  }).join('\n');
}

// Takes a string and adds a prefix and indentation to the first line.
function formatFirstLine(prefix, indent, value) {
  return prefix + ' ' + indent + value;
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
function indexOfIthNonRemovedItem(a, ii) {
  var indexIgnoringRemovedItems = 0;
  for (var jj = 0; jj < a.length; ++jj) {
    if (!a[jj].removed) {
      if (indexIgnoringRemovedItems === ii) {
        return jj;
      }
      ++indexIgnoringRemovedItems;
    }
  }
  return a.length;
}
