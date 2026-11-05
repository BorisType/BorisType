/** Research-only A/B/C sketches. Not compiler nodes or an accepted lowering API. */
import { IR } from "../../build/ir/index.js";
import { BindingManager } from "../../build/lowering/binding.js";

const atom = (value) => ({ tag: "atom", value });
const call = (name, args) => ({ tag: "call", callee: atom(IR.id(name)), args });
const add = (left, right) => ({ tag: "add", left, right });
const branch = (test, yes, no) => ({ tag: "branch", test, yes, no });
const optional = (base, property) => ({ tag: "optional", base, property });
const ledger = atom(IR.id("ledger"));
const invoke = (name) => call(name, [ledger]);
const write = (left, right) => IR.exprStmt(IR.assign("=", left, right));
const append = (text) => IR.exprStmt(IR.assign("+=", IR.dot(IR.id("ledger"), "trace"), IR.string(text)));
const ret = (expression) => IR.return(expression);
const concat = (left, right) => IR.binary("+", left, right);

/** B composes plans while visiting; C retains this semantic tree until normalization. */
function lower(tree, ctx, snapshots) {
  const temporary = (value) => {
    const name = ctx.bindings.create("eval");
    ctx.declarations.push(IR.varDecl(name, null));
    return { prelude: [write(IR.id(name), value)], value: IR.id(name), stable: true };
  };
  function eager(children) {
    const prelude = [];
    const values = [];
    for (const child of children) {
      const plan = lower(child, ctx, snapshots);
      if (snapshots && plan.prelude.length) {
        // Read/call an earlier operand now, not after a later prelude has mutated state.
        for (const previous of values) {
          if (!previous.stable) {
            const saved = temporary(previous.value);
            prelude.push(...saved.prelude);
            previous.value = saved.value;
            previous.stable = true;
          }
        }
      }
      prelude.push(...plan.prelude);
      values.push({ value: plan.value, stable: plan.stable });
    }
    return { prelude, values: values.map((item) => item.value) };
  }
  switch (tree.tag) {
    case "atom":
      return { prelude: [], value: tree.value, stable: tree.value.kind === "Literal" };
    case "add": {
      const ordered = eager([tree.left, tree.right]);
      return { prelude: ordered.prelude, value: IR.binary("+", ...ordered.values), stable: false };
    }
    case "call": {
      const ordered = eager([tree.callee, ...tree.args]);
      return { prelude: ordered.prelude, value: IR.call(ordered.values[0], ordered.values.slice(1)), stable: false };
    }
    case "branch": {
      const test = lower(tree.test, ctx, snapshots);
      const yes = lower(tree.yes, ctx, snapshots);
      const no = lower(tree.no, ctx, snapshots);
      const result = temporary(IR.id("undefined"));
      return {
        prelude: [
          ...test.prelude,
          IR.if(
            test.value,
            IR.block([...yes.prelude, write(result.value, yes.value)]),
            IR.block([...no.prelude, write(result.value, no.value)]),
          ),
        ],
        value: result.value,
        stable: true,
      };
    }
    case "optional": {
      const base = lower(tree.base, ctx, snapshots);
      const saved = temporary(base.value);
      const result = temporary(IR.id("undefined"));
      const nullish = IR.logical("||", IR.binary("==", saved.value, IR.null()), IR.binary("==", saved.value, IR.id("undefined")));
      return {
        prelude: [
          ...base.prelude,
          ...saved.prelude,
          IR.if(
            nullish,
            IR.block([write(result.value, IR.id("undefined"))]),
            IR.block([write(result.value, IR.dot(saved.value, tree.property))]),
          ),
        ],
        value: result.value,
        stable: true,
      };
    }
    default:
      throw new Error(`Unhandled prototype node: ${tree.tag}`);
  }
}

/** Inline control: preserve expression-local evaluation with grouping, no lifted execution. */
function lowerInline(tree, ctx) {
  const lowerChild = (child) => lowerInline(child, ctx);
  switch (tree.tag) {
    case "atom":
      return tree.value;
    case "add":
      return IR.binary("+", lowerChild(tree.left), lowerChild(tree.right));
    case "call":
      return IR.call(lowerChild(tree.callee), tree.args.map(lowerChild));
    case "branch":
      return IR.grouping(IR.conditional(lowerChild(tree.test), lowerChild(tree.yes), lowerChild(tree.no)));
    case "optional": {
      const name = ctx.bindings.create("eval");
      ctx.declarations.push(IR.varDecl(name, null));
      const value = IR.id(name);
      const test = IR.logical(
        "||",
        IR.binary("==", IR.grouping(IR.assign("=", value, lowerChild(tree.base))), IR.null()),
        IR.binary("==", value, IR.id("undefined")),
      );
      return IR.grouping(IR.conditional(test, IR.id("undefined"), IR.dot(value, tree.property)));
    }
    default:
      throw new Error(`Unhandled inline prototype node: ${tree.tag}`);
  }
}

/** Shared native fixture functions take state explicitly; no unsupported bare captures. */
export function prototypeHelpers() {
  function helper(name, body, params = ["ledger"]) {
    return IR.functionDecl(
      name,
      params.map((name) => IR.param(name)),
      body,
      undefined,
      true,
    );
  }
  const state = IR.id("ledger");
  return [
    helper("first", [append("A"), ret(IR.number(1))]),
    helper("second", [append("B"), ret(IR.object([IR.prop("x", IR.number(2))]))]),
    helper("make", [append("X"), ret(IR.object([IR.prop("x", IR.number(9))]))]),
    helper("mutate", [write(IR.dot(state, "x"), IR.number(9)), ret(IR.object([IR.prop("x", IR.number(2))]))]),
    helper("boom", [append("X"), IR.throw(IR.string("stop"))]),
    helper("next", [
      write(IR.dot(state, "count"), IR.binary("+", IR.dot(state, "count"), IR.number(1))),
      ret(IR.object([IR.prop("v", IR.conditional(IR.binary("<", IR.dot(state, "count"), IR.number(3)), IR.number(1), IR.number(0)))])),
    ]),
    helper("add", [ret(IR.binary("+", IR.id("a"), IR.id("b")))], ["a", "b"]),
  ];
}

export const prototypeCases = [
  { id: "lazy", expected: "|false", tree: branch(atom(IR.bool(false)), optional(invoke("make"), "x"), atom(IR.bool(false))) },
  { id: "args", expected: "AB|3", tree: call("add", [invoke("first"), optional(invoke("second"), "x")]) },
  { id: "early-read", expected: "|3", tree: add(atom(IR.dot(IR.id("ledger"), "x")), optional(invoke("mutate"), "x")) },
  {
    id: "nested-lazy",
    expected: "|false",
    tree: branch(
      atom(IR.bool(true)),
      branch(atom(IR.bool(false)), optional(invoke("make"), "x"), atom(IR.bool(false))),
      optional(invoke("make"), "x"),
    ),
  },
  {
    id: "skipped-throw",
    expected: "A|false",
    tree: branch(atom(IR.bool(false)), optional(invoke("boom"), "x"), atom(IR.bool(false))),
    caught: true,
  },
  { id: "while", expected: "3|2", tree: optional(invoke("next"), "v"), loop: true },
];

/** A only scopes branch effects; B/C additionally preserve eager values and loop points. */
export function buildExpressionPrototype(item, variant) {
  const ctx = { bindings: new BindingManager(), declarations: [] };
  ctx.bindings.registerSourceNames(["ledger", "value", "guard", "first", "second", "make", "mutate", "boom", "next", "add"]);
  // C deliberately shares the B normalizer: same target cost, different location of semantic information.
  const plan = variant === "I" ? { prelude: [], value: lowerInline(item.tree, ctx) } : lower(item.tree, ctx, variant !== "A");
  const init = IR.varDecl(
    "ledger",
    IR.object([IR.prop("trace", IR.string("")), IR.prop("x", IR.number(1)), IR.prop("count", IR.number(0))]),
  );
  let body;
  if (item.loop) {
    const test = IR.binary("!==", plan.value, IR.number(0));
    const loopBody = [
      IR.exprStmt(IR.update("++", IR.id("guard"), false)),
      IR.if(IR.binary(">=", IR.id("guard"), IR.number(5)), IR.block([IR.break()])),
    ];
    const loop =
      variant === "A" || variant === "I"
        ? [...plan.prelude, IR.while(test, IR.block(loopBody))]
        : [
            IR.while(
              IR.bool(true),
              IR.block([...plan.prelude, IR.if(IR.unary("!", IR.grouping(test)), IR.block([IR.break()])), ...loopBody]),
            ),
          ];
    body = [
      IR.varDecl("guard", IR.number(0)),
      ...loop,
      ret(concat(concat(concat(IR.string(""), IR.dot(IR.id("ledger"), "count")), IR.string("|")), IR.id("guard"))),
    ];
  } else {
    const execution = [...plan.prelude, IR.varDecl("value", plan.value)];
    body = item.caught ? [IR.try(IR.block([...execution, append("A")]), IR.catch("error", IR.block([append("C")])))] : execution;
    body.push(ret(concat(concat(IR.dot(IR.id("ledger"), "trace"), IR.string("|")), IR.id("value"))));
  }
  return IR.functionDecl(`probe_${item.id.replaceAll("-", "_")}`, [], [init, ...ctx.declarations, ...body], undefined, true);
}
