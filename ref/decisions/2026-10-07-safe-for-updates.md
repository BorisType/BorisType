# C-safe classic for updates

**Date:** 2026-10-07

**Status:** Accepted (independent C smoke passed, 2026-10-07)

## Context

The user reports the independent C runtime hangs in check27 of `BtAbruptProbe.js`:

```js
for (i = 0; i < 3; ledger.value = ledger.value + "U", i++) {
  // labelled continue crossing finally, lowered to completion state
}
```

The likely skipped increment would keep `i < 3` true. This is a user-observed
execution discrepancy, not confirmation of C parser internals or all comma
contexts. Node and the supplied JS BorisScript runtime evaluate the sequence
correctly. A bounded raw/legacy/fixed probe distinguishes these possibilities.

## Decision

Run immutable `forUpdateDesugarPass` before abrupt-completion target resolution
in both compilation entrypoints and all compile modes. Detect binary comma and
sequence IR recursively in updates; argument-list separators do not count.

Affected loops become:

```js
init;
var first = true; // collision-safe physical name; hoisted by the existing pass
while (true) {
  if (first) {
    first = false;
  } else {
    updateA;
    updateB;
  }
  if (!condition) {
    break;
  } // absent for an omitted condition
  originalBody;
}
```

Keep the loop's original target id on the while. A surrounding iteration label
still aliases that loop even though its body now has an init prelude, as with
expanded for-of. Explicitly normalize nested loops/functions in replaced bodies;
no-op input retains object identity. Reserve temporary names through the shared
BindingManager. Recognize nested/grouped sequences, split discarded top-level
expressions left to right, and preserve conditional/logical short-circuiting.
Value-consuming subexpressions remain intact outside the for header; this pass
does not implement arbitrary expression linearization or eliminate every comma
operator from a program.

The first-entry flag skips update only before the first test. Normal completion
and continue enter update on the next while entry. Source finalizers have already
completed before this entry; overrides to break/return/throw leave without an
update, while overrides to continue execute it once. An update exception aborts
the remaining sequence and condition. Enclosing catches/finalizers still observe
that exception. A false condition after update keeps that update's side effects.

The completion pass preserves a completion-free loop prefix outside generated
escape frames. Native jumps there must resolve to this iteration (or complete
nested boundaries) and cross no finalizer. A stateful suffix retains the existing
carrier. Thus the generated condition's native break exits the real while and
does not allocate/set a completion record solely to end the loop.

The emitter rejects any comma operator surviving in a for update, including
nested/grouped occurrences. This makes bypassing/misordering normalization fail
closed rather than emitting another potentially unbounded C loop.

## Verification

Tests were added before implementation: the old compiler fails the unsafe-header
assertion. IR tests cover immutability, idempotence, aliases, metadata, nesting and
emitter rejection. Output tests inspect JS AST rather than confusing argument
commas with sequence operators. Budgets reject helper functions/calls, completion
records on ordinary affected loops, and excessive growth of a representative
finalizer case.

97 semantic cases exercise normal/zero iterations, native/labelled/chained
continue, nested loops/switches, reentry, omitted conditions, update/condition
exceptions, skipped updates on break/return/throw, grouped/nested sequences,
short-circuiting, call arguments and the 5×5×3 finalizer override matrix. They run
in the strict Node/JS gate in bare/script/module. Two E2E fixtures also cover
script-level traces and finalizer override.

`Check27Fixed.js` is generated from the actual current compiler and bounded to
64 loop entries (including carrier entries), expected `0FU1FU2FU|E`. The larger
`Check27Diagnostic.js` retains the deliberately unsafe pre-fix shape plus raw,
simple-update and helper-update controls, all bounded. The full generated C pack
expects `OK: 60/60`.

On 2026-10-07 the user manually ran both files on the independent C platform and
reported `Check27Fixed.js` → `MESSAGE: 0FU1FU2FU|E` and the full
`BtAbruptProbe.js` → `MESSAGE: OK: 60/60`. The workaround and all 60 selected
bare-mode smoke cases therefore passed on that platform. Its version was not
provided. This is not execution of the entire 1920-case matrix or script/module
modes on C, nor proof of the original C parser's failure mechanism. The raw and
legacy diagnostic controls have no reported C result.

## Consequences

- One scalar flag and one first-entry branch per affected iteration; no helper
  call, descriptor, closure/environment allocation or copied finalizer.
- Simple updates retain their native for and incur no added execution cost.
- Affected output is somewhat larger; completion-free condition exits remain
  native to limit overhead on the slow target runtime.
- Nested consumed commas still depend on ordinary expression support outside
  update headers; other comma contexts require evidence and separate work.
- Existing let/per-iteration closure and unsupported initializer limitations
  are unchanged. This workaround does not claim to implement those semantics.

## Alternatives considered

1. Parenthesize comma update: smallest output, but no evidence C executes every
   operand; does not reliably address a skipped increment.
2. Append split update statements at the body tail: compact, but native continue
   skips update; rewriting every continue must also handle targets and finalizers.
3. Rewrite continue and use an explicit update epilogue: can avoid a first-entry
   branch, but needs deeper coupling with completion lowering and state even on
   otherwise native paths. Deferred until a proof/benchmark justifies it.
4. Helper call in the header: avoids comma operator but adds calls/argument
   handling on the slow platform and complicates scope/capture. Not chosen.
5. First-entry while: a small selective structural rewrite with correct native
   continue and exception order; chosen, with targeted prefix optimization.
6. Full expression/CFG linearization: much broader than this observed defect;
   increases temporary storage and risks reference/evaluation-order semantics.
