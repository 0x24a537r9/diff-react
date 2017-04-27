# diff-react
The Smart™ React tree differ.

## What's it do?
`diff-react` provides a single function for shallow-rendering and diffing two React components. The idea is that basic snapshotting, while great for small components that don't change frequently, doesn't scale well to large components or components that change frequently (since the snapshots tend to be brittle, breaking due to unrelated changes somewhere else in the component). Shallow rendering helps this somewhat but doesn't obviate the problem entirely. Instead, it would be better to create snapshots that only contain DOM changes relative to some baseline rendering.

For example, if you wanted to test that `<MyButton disabled={true}/>` properly grays out the text and icon inside, with Jest you could do something like:

    expect(diffReact(
      <MyButton />,
      <MyButton disabled={true} />,
    )).toMatchSnapshot();

This would then create a minimal diff snapshot that you could test against, highlighting only the relevant changes in your custom component and their context:

     <Button …=…
    -   disabled={false}
    +   disabled={true}
     >
       <Image …=…
         style={
           Object {
    -        "tintColor": "#eee",
    +        "tintColor": "#666",
           }
         }
       />
       <Text …=…
         style={
           Object {
    -        "color": "#eee",
    +        "color": "#666",
           }
         }
       >…</Text>
     </Button>

## How's it work?
Well, from a high-level perspective:
  1. `diffReact()` receives two React elements and an optional canonicalization function.
  2. Using Jest's shallow renderer, it renders the elements one-level deep.
  3. `virtualizeTree()` then takes each shallowly-rendered tree and recursively converts each node into `virtual-dom` `VNode`, `VText` or `SENTINEL_NULL_VNODE`. As we traverse each node, we also canonicalize the props to ignore certain irrelevant changes later (e.g. non-rendering `on*` handler props).
  4. `virtual-dom`'s `diff()` then performs a diff on the two canonicalized, `VNode`-based trees, returning basically a POJO that maps numeric in-order traversal node indices to patches (e.g. insert/remove/replace/change props/reorder operations).
  5. `serializePatchesRecursively()` recurses over the original in-order building a serialized diff as it goes based on the original `VNode` tree and the patch map:
     * For `VTEXT` and `VNODE` patches (which represent node replacements), `serializeTree()`, a simplified version of `serializePatchesRecursively)` that takes a `VNode` tree (without patches), an indent level, and a modification prefix (e.g. `+`/`-`) and returns a the tree rendered with those params, is used to render the before node (with `-`) and the after node (with `+`).
     * For `PROPS` patches (which represent props changes), iterate over the list of combined props from the original `VNode` and the patch, and serialize each one:
        * For props that are equal, combine them all into a single `…=…` prop.
        * For primitives that differ, print the before prop with a `-` prefix before each line and the after prop with a `+` prefix.
        * For arrays, objects, and React trees (all of which can be complex), serialize the values with with `prettyFormat()` and run a text diff on them. In order to provide shorter diffs than just entire before prop and the entire after prop, `formatArrayOrObjectPropDiff()` collapses equal chunks of text to `…`.
     * For `INSERT` patches, serialize the `patch.patch` with `serializeTree()` and add it to the end of the children array with `+` prefixes. If the node was actually inserted in the middle of a list, we should expect an `ORDER` patch to follow, which will move it into the right location.
     * For `REMOVE` patches, serialize the node in-place using `serializeTree()` and `-` prefixes.
     * For `ORDER` patches (which represent children being reordered)... it's probably best explained by looking at the code directly.

This module also does some things like collapse all the children to `…` if they're all equal and try to keep props on the same line as the start tag in `serializeTree()` if possible, but that covers the vast majority of this module's complexity.
