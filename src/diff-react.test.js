/**
 * Copyright 2015-present Oculus VR, LLC. All Rights Reserved.
 *
 * @flow
 */

import type {
  CanonicalizePropFn,
  CanonicalizePropsFn,
  RenderedReactElement,
} from './diff-react.js';

import React from 'react';
import diffReact, {
  formatArrayOrObjectPropDiff,
  indexOfIthNonRemovedItem,
} from './diff-react.js';

describe('diffReact()', () => {
  function wrapAndDiffReact(
    before: React.Element<any> | null,
    after: React.Element<any> | null,
    canonicalizePropsFn?: CanonicalizePropsFn,
  ): string {
    const Before = () => before;
    const After = () => after;
    return diffReact(<Before />, <After />, canonicalizePropsFn);
  }

  it('recognizes falsey root values as equal', () => {
    expect(wrapAndDiffReact(null, null)).toBe('(No visual differences)');
  });

  it('shows diffs for replacing an element with falsey value', () => {
    expect(wrapAndDiffReact(<div />, null)).toMatchSnapshot();
  });

  it('shows diffs for replacing a falsey value with an element', () => {
    expect(wrapAndDiffReact(null, <div />)).toMatchSnapshot();
  });

  it('recognizes single equivalent components as equal', () => {
    expect(wrapAndDiffReact(<div />, <div />)).toBe(
      '(No visual differences)',
    );
  });

  it('shows diffs for single components with different types', () => {
    expect(wrapAndDiffReact(<div />, <img />)).toMatchSnapshot();
  });

  it('recognizes single otherwise identical components as different if they have different keys', () => {
    expect(
      wrapAndDiffReact(<div key="a" />, <div key="b" />),
    ).toMatchSnapshot();
  });

  it('shows diffs for single components with different types with equal props/children', () => {
    expect(
      wrapAndDiffReact(
        <div a="1"><div b="2" /></div>,
        <img a="1"><div b="2" /></img>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes single components with equal props as equal', () => {
    expect(
      wrapAndDiffReact(
        <div equal1="a" equal2="b" />,
        <div equal1="a" equal2="b" />,
      ),
    ).toBe('(No visual differences)');
  });

  it('shows diffs for single components with only different props', () => {
    expect(
      wrapAndDiffReact(
        <div diff1="a" diff2="b" />,
        <div diff1="c" diff2="d" />,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for single components with equal and different props', () => {
    expect(
      wrapAndDiffReact(
        <div diff1="a" equal1="b" />,
        <div diff1="c" equal1="b" />,
      ),
    ).toMatchSnapshot();
  });

  it('shows text diffs for object props that are different', () => {
    expect(
      wrapAndDiffReact(
        <div object={{a: 1, b: 2, c: 3}} />,
        <div object={{a: 1, b: 5, d: 3}} />,
      ),
    ).toMatchSnapshot();
  });

  it('shows text diffs for array props that are different', () => {
    expect(
      wrapAndDiffReact(
        <div array={[1, 2, 3, 4, 5]} />,
        <div array={[1, 6, 7, 4]} />,
      ),
    ).toMatchSnapshot();
  });

  it('shows text diffs for React props that are different', () => {
    // For some reason, the element tagName is not being preserved, nor are the
    // text props being added consistently.
    // TODO(mikea): Figure out why this is acting the way it is.
    expect(
      wrapAndDiffReact(
        <div react={<span>{'Before'}</span>} />,
        <div react={<span>{'After'}</span>} />,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for complex props changes', () => {
    // Note, this test's snapshot is actually slightly incorrect due to a bug
    // in virtual-dom, specifically that regex props are ignored when diffing.
    // TODO(who): Fix https://github.com/Matt-Esch/virtual-dom/issues/431.
    expect(
      wrapAndDiffReact(
        <div
          diffArray={[0, 1, 2]}
          diffBoolean={false}
          diffFalsey={false}
          diffMultilineString="a\nb\nc"
          diffNumber={0}
          diffObject={{
            diffArray: [0, 1, 2],
            diffBoolean: false,
            diffFalsey: false,
            diffMultilineString: 'a\nb\nc',
            diffNumber: 0,
            diffObject: {
              diffString: 'a',
              diffMultilineString: 'a\nb\nc',
              diffNumber: 0,
              diffBoolean: false,
            },
            diffRegex: /a/,
            diffString: 'a',
          }}
          diffRegex={/a/}
          diffString="a"
        />,
        <div
          diffArray={[3, 4]}
          diffBoolean={true}
          diffFalsey={null}
          diffMultilineString="d\ne\nf"
          diffNumber={1}
          diffObject={{
            diffArray: [3, 4],
            diffBoolean: true,
            diffFalsey: null,
            diffMultilineString: 'd\ne\nf',
            diffNumber: 1,
            diffObject: {
              diffString: 'b',
              diffMultilineString: 'd\ne\nf',
              diffNumber: 1,
              diffBoolean: true,
            },
            diffRegex: /b/,
            diffString: 'b',
          }}
          diffRegex={/b/}
          diffString="b"
        />,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for single components with an added prop', () => {
    expect(wrapAndDiffReact(<div />, <div a="1" />)).toMatchSnapshot();
  });

  it('shows diffs for single components with a removed prop', () => {
    expect(wrapAndDiffReact(<div a="1" />, <div />)).toMatchSnapshot();
  });

  it('shows diffs for single components with different nested types', () => {
    expect(
      wrapAndDiffReact(<div><div /></div>, <div><img /></div>),
    ).toMatchSnapshot();
  });

  it('shows diffs for single components with different nested types but equal props', () => {
    expect(
      wrapAndDiffReact(
        <div><div a="1" /></div>,
        <div><img a="1" /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for nested, completely different components', () => {
    expect(
      wrapAndDiffReact(
        <div><div a="1" b="2" /></div>,
        <div><img c="3" d="4" /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes all falsey values as equal as children', () => {
    expect(
      wrapAndDiffReact(<div>{false}</div>, <div>{undefined}</div>),
    ).toBe('(No visual differences)');

    expect(
      wrapAndDiffReact(<div>{undefined}</div>, <div>{null}</div>),
    ).toBe('(No visual differences)');

    expect(wrapAndDiffReact(<div>{null}</div>, <div>{false}</div>)).toBe(
      '(No visual differences)',
    );

    expect(
      wrapAndDiffReact(<div>{[null, false, undefined]}</div>, <div />),
    ).toBe('(No visual differences)');

    expect(
      wrapAndDiffReact(
        <div>{[false, undefined, null]}</div>,
        <div>{[null, false]}</div>,
      ),
    ).toBe('(No visual differences)');

    expect(
      wrapAndDiffReact(
        <div>{[null, false]}</div>,
        <div>{[false, undefined, null]}</div>,
      ),
    ).toBe('(No visual differences)');
  });

  it('shows diffs for swapping in conditionally-rendered children', () => {
    expect(
      wrapAndDiffReact(
        <div a="1">{false}</div>,
        <div a="1"><img /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for swapping out conditionally-rendered children', () => {
    expect(
      wrapAndDiffReact(
        <div a="1"><img /></div>,
        <div a="1">{false}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('keeps track of patch indices correctly when removing an item deep in a tree', () => {
    // If we weren't properly keeping track of the in-order node index as we
    // traversed through the tree (remembering to increment for nested
    // children), our serialization logic might incorrectly identify which node
    // should be marked as removed below.
    expect(
      wrapAndDiffReact(
        <div>
          <div key="a"><div key="b" /><div key="c" /></div>
          <div key="d"><div key="e" /><div key="f" /></div>
        </div>,
        <div>
          <div key="a"><div key="b" /><div key="c" /></div>
          <div key="d"><div key="e" /></div>
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for adding to a list of children', () => {
    expect(
      wrapAndDiffReact(
        <div a="1" />,
        <div a="1">{[<img key="1" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for removing from a list of children', () => {
    expect(
      wrapAndDiffReact(
        <div a="1">{[<img key="1" />]}</div>,
        <div a="1" />,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for removing children from nested lists', () => {
    // This effectively tests that child removal doesn't mess up the in-order
    // tree traversal indices, which are used to map patches to nodes.
    expect(
      wrapAndDiffReact(
        <div a="1">
          {[<div key="1" />, <div key="2">{[<div key="3" />]}</div>]}
        </div>,
        <div a="1">{[<div key="2">{[]}</div>]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for children being reordered', () => {
    expect(
      wrapAndDiffReact(
        <div>{[<div key="a" />, <div key="b" />, <div key="c" />]}</div>,
        <div>{[<div key="c" />, <div key="b" />, <div key="a" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for children being reordered with additions and removals', () => {
    expect(
      wrapAndDiffReact(
        <div>
          {[
            <div key="a" />,
            <div key="b" />,
            <div key="c" />,
            <div key="e" />,
          ]}
        </div>,
        <div>
          {[
            <div key="c" />,
            <div key="b" />,
            <div key="d" />,
            <div key="e" />,
          ]}
        </div>,
      ),
    ).toMatchSnapshot();

    expect(
      wrapAndDiffReact(
        <div>
          {[
            <div key="a" />,
            <div key="b" />,
            <div key="c" />,
            <div key="d" />,
            <div key="e" />,
          ]}
        </div>,
        <div>
          {[
            <div key="a" />,
            <div key="e" />,
            <div key="d" />,
            <div key="b" />,
          ]}
        </div>,
      ),
    ).toMatchSnapshot();

    expect(
      wrapAndDiffReact(
        <div>
          {[
            <div key="a" />,
            <div key="b" />,
            <div key="c" />,
            <div key="d" />,
            <div key="e" />,
          ]}
        </div>,
        <div>
          {[
            <div key="a" />,
            <div key="e" />,
            <div key="d" />,
            <div key="c" />,
          ]}
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows (albeit mysterious) diffs for falsey children being reordered', () => {
    expect(
      wrapAndDiffReact(
        <div>
          {[<div key="a" />, <div key="b" />, null, <div key="c" />]}
        </div>,
        <div>
          {[<div key="a" />, null, <div key="b" />, <div key="c" />]}
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes mixed-keyed children being reordered', () => {
    expect(
      wrapAndDiffReact(
        <div>
          <div name="separator" />
          {[<div key="a" />, <div key="b" />, <div key="c" />]}
        </div>,
        <div>
          {[<div key="b" />]}
          <div name="separator" />
          {[<div key="c" />, <div key="a" />]}
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes nested reorderings', () => {
    expect(
      wrapAndDiffReact(
        <div>
          {[
            <div key="a" />,
            <div key="b">
              {[<div key="d" />, <div key="e" />]}
            </div>,
            <div key="c" />,
          ]}
        </div>,
        <div>
          {[
            <div key="b">
              {[<div key="e" />, <div key="d" />]}
            </div>,
            <div key="a" />,
            <div key="c" />,
          ]}
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a child being removed from the middle of a list', () => {
    // A naive diffing algorithm might interpret the transformation below as a
    // modification of the second child and removal of the third child, but we'd
    // rather that diffReact actually explain the transformation as the removal
    // of the second child (as hinted by the keys).
    expect(
      wrapAndDiffReact(
        <div>{[<div key="1" />, <div key="2" />, <div key="3" />]}</div>,
        <div>{[<div key="1" />, <div key="3" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a child being added to the middle of a list', () => {
    // A naive diffing algorithm might interpret the transformation below as a
    // modification of the second child and addition of a third child, but we'd
    // rather that diffReact actually explain the transformation as the addition
    // of the second child (as hinted by the keys).
    expect(
      wrapAndDiffReact(
        <div>{[<div key="1" />, <div key="3" />]}</div>,
        <div>{[<div key="1" />, <div key="2" />, <div key="3" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a child being removed from the middle of a list in a reordered parent', () => {
    // This test is designed to ensure that the in-order traversal index used
    // for removals is not messed up by reorderings of the parent.
    expect(
      wrapAndDiffReact(
        <div>{[<div key="1" />, <div key="2"><div /></div>]}</div>,
        <div>{[<div key="2" />, <div key="1" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a child being added to the middle of a list in a reordered parent', () => {
    // This test is designed to ensure that the in-order traversal index used
    // for additions is not messed up by reorderings of the parent.
    expect(
      wrapAndDiffReact(
        <div>{[<div key="1" />, <div key="2" />]}</div>,
        <div>{[<div key="2"><div /></div>, <div key="1" />]}</div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a conditionally-rendered child being swapped out of the middle of a list', () => {
    // A naive diffing algorithm might interpret the transformation below as a
    // modification of the second child and removal of the third child, or
    // instead as a removal of the third child, but we'd rather that diffReact
    // actually explain the transformation as the removal of the second child
    // (as hinted by the falsey placeholder).
    expect(
      wrapAndDiffReact(
        <div><div /><div /><div /></div>,
        <div><div />{false}<div /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes a conditionally-rendered child being swapped into the middle of a list', () => {
    // A naive diffing algorithm might interpret the transformation below as a
    // modification of the second child and addition of a third child, or
    // instead as an addition of a third child but we'd rather that diffReact
    // actually explain the transformation as the addition of the second child
    // (as hinted by the falsey placeholder).
    expect(
      wrapAndDiffReact(
        <div><div />{false}<div /></div>,
        <div><div /><div /><div /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('degenerates as expected when a child is removed from the middle without a key or placeholder', () => {
    // Because React has no falsey placeholder or key to help identify that the
    // old third child is now the new second child, we expect it to treat this
    // diff as a full removal of the second child, addition of a new second
    // child, and removal of the third child. This reflects exactly how the
    // React reconciler would interpret this change.
    expect(
      wrapAndDiffReact(
        <div><img a="1" /><div b="2" /><img c="3" /></div>,
        <div><img a="1" /><img c="3" /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('degenerates as expected when a child is added from the middle without a key or placeholder', () => {
    // Because React has no falsey placeholder or key to help identify that the
    // old second child is now the new third child, we expect it to treat this
    // diff as a full removal of the second child, addition of a new second
    // child, and addition of a new third child. This reflects exactly how the
    // React reconciler would interpret this change.
    expect(
      wrapAndDiffReact(
        <div><img a="1" /><img c="3" /></div>,
        <div><img a="1" /><div b="2" /><img c="3" /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('correctly handles props changes when there are changes earlier in the tree', () => {
    // This test is designed to ensure that the in-order traversal index used
    // for props changes is not messed up by changes to the rendered tree before
    // the element.
    expect(
      wrapAndDiffReact(
        <div>
          {[<div key="1" />, <div key="2" />]}
          <div key="tested" />
        </div>,
        <div>
          {[<div key="1" />, <div key="2" />, <div key="3"><div /></div>]}
          <div name="newElement" />
          <div key="tested" newProp="new" />
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('shows diffs for reordering and type tagName changes simultaneously', () => {
    expect(
      wrapAndDiffReact(
        <div>
          {[
            <div key="a" x="1" />,
            <div key="b" x="2" />,
            <div key="c" x="3" />,
          ]}
        </div>,
        <div>
          {[
            <div key="a" x="1" />,
            <img key="c" x="3" />,
            <div key="b" x="9" />,
          ]}
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('collapses equal props and keys with differing children', () => {
    expect(
      wrapAndDiffReact(
        <div key="abc" name="abc"><div name="bcd" /></div>,
        <div key="abc" name="abc"><img /></div>,
      ),
    ).toMatchSnapshot();
  });

  it('collapses deeply-equal complex sibling trees', () => {
    expect(
      wrapAndDiffReact(
        <div name="container">
          <div name="abc">
            <div name="bcd">
              <div name="cde">
                <div name="def" />
              </div>
            </div>
            <span>{'My text'}</span>
          </div>
          <div a="1" b="2" />
          <div name="zyx">
            <span>{'My other text'}</span>
            <div name="yxw">
              <div name="xwv">
                <div name="wvu" />
              </div>
            </div>
          </div>
        </div>,
        <div name="container">
          <div name="abc">
            <div name="bcd">
              <div name="cde">
                <div name="def" />
              </div>
            </div>
            <span>{'My text'}</span>
          </div>
          <img c="3" d="4" />
          <div name="zyx">
            <span>{'My other text'}</span>
            <div name="yxw">
              <div name="xwv">
                <div name="wvu" />
              </div>
            </div>
          </div>
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes and collapses equal props on reordered elements', () => {
    expect(
      wrapAndDiffReact(
        <div a="1">
          <img key="image">
            {'Should be collapsed'}
          </img>
        </div>,
        <div a="1">
          <div b="2" />
          <img key="image">
            {'Should be collapsed'}
          </img>
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes strings as equal', () => {
    expect(
      wrapAndDiffReact(<span>{'Equal'}</span>, <span>{'Equal'}</span>),
    ).toBe('(No visual differences)');
  });

  it('recognizes diffs in strings', () => {
    expect(
      wrapAndDiffReact(<span>{'Equal'}</span>, <span>{'Diff'}</span>),
    ).toMatchSnapshot();
  });

  it('formats multiline strings diffs correctly', () => {
    expect(
      wrapAndDiffReact(
        <span>{'Line1\nLine2'}</span>,
        <span>{'Line3\nLine4'}</span>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes strings being removed', () => {
    expect(
      wrapAndDiffReact(<span>{'Removed'}</span>, <span />),
    ).toMatchSnapshot();
  });

  it('recognizes strings being added', () => {
    expect(
      wrapAndDiffReact(<span />, <span>{'Added'}</span>),
    ).toMatchSnapshot();
  });

  it('recognizes strings being swapped out for a falsey value', () => {
    expect(
      wrapAndDiffReact(<span>{'Removed'}</span>, <span>{false}</span>),
    ).toMatchSnapshot();
  });

  it('recognizes strings being swapped in for a falsey value', () => {
    expect(
      wrapAndDiffReact(<span>{false}</span>, <span>{'Added'}</span>),
    ).toMatchSnapshot();
  });

  it('recognizes strings being swapped out for another component', () => {
    expect(
      wrapAndDiffReact(
        <span>{'Removed'}</span>,
        <span><span>{'Added'}</span></span>,
      ),
    ).toMatchSnapshot();
  });

  it('recognizes strings being swapped in for another component', () => {
    expect(
      wrapAndDiffReact(
        <span><span>{'Removed'}</span></span>,
        <span>{'Added'}</span>,
      ),
    ).toMatchSnapshot();
  });

  it('treats on* handlers as equal', () => {
    function onClick1() {}
    function onClick2() {}
    expect(
      wrapAndDiffReact(
        <div onClick={onClick1} />,
        <div onClick={onClick2} />,
      ),
    ).toBe('(No visual differences)');
  });

  it('shows diffs between non-handler function props', () => {
    function renderPage1() {}
    function renderPage2() {}
    expect(
      wrapAndDiffReact(
        <div renderPage={renderPage1} />,
        <div renderPage={renderPage2} />,
      ),
    ).toMatchSnapshot();
  });

  it('treats props set to undefined the same as not unspecified', () => {
    expect(wrapAndDiffReact(<div a={undefined} />, <div />)).toBe(
      '(No visual differences)',
    );
  });

  it('renders exactly one level deep', () => {
    function Foo({
      children,
      render,
    }: {children?: React.Children, render: boolean}) {
      return render
        ? <div><Foo render={true}>{children}</Foo>{children}</div>
        : null;
    }
    // We don't want to wrap this one first since we're actually passing a
    // custom element already.
    expect(
      diffReact(
        <Foo render={false}><div key="child" /></Foo>,
        <Foo render={true}><div key="child" /></Foo>,
      ),
    ).toMatchSnapshot();
  });

  it('wraps props of a newly-added tree to new lines if they would make the start tag line >100 chars', () => {
    expect(
      wrapAndDiffReact(
        <div />,
        <div>
          <div
            aReallyLongProp1="aaaaaaaaa"
            aReallyLongProp2="bbbbbbbbb"
            notLongEnoughToWrap="ccccccccc"
          />
        </div>,
      ),
    ).toMatchSnapshot();

    expect(
      wrapAndDiffReact(
        <div />,
        <div>
          <div
            aReallyLongProp1="aaaaaaaaa"
            aReallyLongProp2="bbbbbbbbb"
            justLongEnoughToWrap="ccccccccc"
          />
        </div>,
      ),
    ).toMatchSnapshot();
  });

  it('implements custom canonicalizers correctly', () => {
    let i = 0;
    function customCanonicalizeProps(
      renderedElement: RenderedReactElement,
      props: Object,
      defaultCanonicalizePropFn: CanonicalizePropFn,
    ): Object {
      const newProps = {};
      for (const prop in props) {
        if (prop === 'mutable') {
          newProps[prop] = i++;
        } else if (typeof newProps[prop] === 'function') {
          // Don't treat all functions as equal.
          newProps[prop] = props[prop];
        } else if (newProps[prop] === undefined) {
          // Preserve undefined values.
          newProps[prop] = props[prop];
        } else {
          newProps[prop] = defaultCanonicalizePropFn(
            renderedElement,
            prop,
            props[prop],
          );
        }
      }
      return newProps;
    }

    function foo() {}

    function bar() {}

    expect(
      wrapAndDiffReact(
        <div function={foo} mutable={null} objectWithFunction={{fn: foo}} />,
        <div
          function={bar}
          mutable={null}
          objectWithFunction={{fn: bar}}
          undefined={undefined}
        />,
      ),
    ).toBe('(No visual differences)');

    expect(
      wrapAndDiffReact(
        <div function={foo} mutable={null} objectWithFunction={{fn: foo}} />,
        <div
          function={bar}
          mutable={null}
          objectWithFunction={{fn: bar}}
          undefined={undefined}
        />,
        customCanonicalizeProps,
      ),
    ).toMatchSnapshot();
  });
});

describe('formatArrayOrObjectPropDiff', () => {
  it('serializes simple additions on empty objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', {}, {a: '1'}),
    ).toMatchSnapshot();
  });

  it('serializes simple removals to empty objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', {a: '1'}, {a: undefined}),
    ).toMatchSnapshot();
  });

  it('serializes simple additions on non-empty objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', {a: '1'}, {b: '2'}),
    ).toMatchSnapshot();
  });

  it('serializes simple removals to non-empty objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', {a: '1', b: '2'}, {b: undefined}),
    ).toMatchSnapshot();
  });

  it('serializes simple mutations on objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', {a: '1'}, {a: '2'}),
    ).toMatchSnapshot();
  });

  it('serializes mixed changes to simple objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff(
        '',
        'prop',
        {a: '1', b: '2', c: '3', d: '4'},
        {b: '5', d: undefined, e: '5'},
      ),
    ).toMatchSnapshot();
  });

  it('serializes simple additions on empty arrays correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', [], {'0': '1'}),
    ).toMatchSnapshot();
  });

  it('serializes simple removals to empty arrays correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', ['1'], {'0': undefined}),
    ).toMatchSnapshot();
  });

  it('serializes simple additions on non-empty arrays correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', ['1'], {'1': '2'}),
    ).toMatchSnapshot();
  });

  it('serializes simple removals to non-empty arrays correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', ['1', '2'], {'1': undefined}),
    ).toMatchSnapshot();
  });

  it('serializes simple mutations on arrays correctly', () => {
    expect(
      formatArrayOrObjectPropDiff('', 'prop', ['1'], {'0': '2'}),
    ).toMatchSnapshot();
  });

  it('does not collapse consecutive unchanged lines when <= 2', () => {
    expect(
      formatArrayOrObjectPropDiff(
        '',
        'prop',
        {a: '1', b: '2', c: '3'},
        {a: '1', b: '-2', c: '3'},
      ),
    ).toMatchSnapshot();
  });

  it('does collapse consecutive unchanged lines when > 2', () => {
    expect(
      formatArrayOrObjectPropDiff(
        '',
        'prop',
        {a: '1', b: '2', c: '3', d: '4', e: '5'},
        {a: '1', b: '2', c: '-3', d: '4', e: '5'},
      ),
    ).toMatchSnapshot();
  });

  it('serializes changes to complex flat objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff(
        '',
        'prop',
        {
          a: '1',
          b: 2,
          c: null,
          d: /foo/,
          e: () => 1,
        },
        {
          a: '2',
          b: 3,
          c: false,
          d: /bar/,
          e: () => 2,
        },
      ),
    ).toMatchSnapshot();
  });

  it('serializes changes to nested objects correctly', () => {
    expect(
      formatArrayOrObjectPropDiff(
        '',
        'prop',
        {
          a: {b: {c: {d: 4}}},
          e: {f: {g: 7}},
        },
        {
          a: {b: {c: {d: 5}}},
          e: {f: {g: 8}},
        },
      ),
    ).toMatchSnapshot();
  });

  it('indents as specified', () => {
    expect(
      formatArrayOrObjectPropDiff('  ', 'prop', {}, {a: '1'}),
    ).toMatchSnapshot();
  });
});

describe('indexOfIthNonRemovedItem', () => {
  it('returns 0 for empty arrays', () => {
    expect(indexOfIthNonRemovedItem([], 0)).toBe(0);
  });

  it('returns the array length for indices past the end of an array', () => {
    expect(
      indexOfIthNonRemovedItem(
        [{removed: false, serializedChild: '<div key="0" />'}],
        3,
      ),
    ).toBe(1);
  });

  it('returns the correct index when no items are removed', () => {
    const a = [
      {removed: false, serializedChild: '<div key="0" />'},
      {removed: false, serializedChild: '<div key="1" />'},
      {removed: false, serializedChild: '<div key="2" />'},
    ];
    expect(indexOfIthNonRemovedItem(a, 0)).toBe(0);
    expect(indexOfIthNonRemovedItem(a, 1)).toBe(1);
    expect(indexOfIthNonRemovedItem(a, 2)).toBe(2);
    expect(indexOfIthNonRemovedItem(a, 3)).toBe(3);
  });

  it('returns the correct index when items are removed', () => {
    const a = [
      {removed: false, serializedChild: '<div key="0" />'},
      {removed: false, serializedChild: '<div key="1" />'},
      {removed: true, serializedChild: '<div key="2" />'},
      {removed: false, serializedChild: '<div key="3" />'},
      {removed: true, serializedChild: '<div key="4" />'},
      {removed: false, serializedChild: '<div key="5" />'},
      {removed: false, serializedChild: '<div key="6" />'},
      {removed: true, serializedChild: '<div key="8" />'},
      {removed: true, serializedChild: '<div key="9" />'},
      {removed: false, serializedChild: '<div key="10" />'},
      {removed: false, serializedChild: '<div key="11" />'},
      {removed: true, serializedChild: '<div key="12" />'},
    ];
    expect(indexOfIthNonRemovedItem(a, 0)).toBe(0);
    expect(indexOfIthNonRemovedItem(a, 1)).toBe(1);
    expect(indexOfIthNonRemovedItem(a, 2)).toBe(3);
    expect(indexOfIthNonRemovedItem(a, 3)).toBe(5);
    expect(indexOfIthNonRemovedItem(a, 4)).toBe(6);
    expect(indexOfIthNonRemovedItem(a, 5)).toBe(9);
    expect(indexOfIthNonRemovedItem(a, 6)).toBe(10);
    expect(indexOfIthNonRemovedItem(a, 7)).toBe(12);
    expect(indexOfIthNonRemovedItem(a, 8)).toBe(12);
    expect(indexOfIthNonRemovedItem(a, 9)).toBe(12);
  });
});
