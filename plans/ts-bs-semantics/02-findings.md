# L1. Реестр находок и seed reproductions

Дата: 2026-10-07. Baseline/runtime/methodology: [00-context.md](./00-context.md).
Большинство новых observations относятся к `script`; перенос на остальные modes
и C — отдельная работа. Это не permanent test suite: executable cases создаёт `F-02`.

Priority: P1 — общая потеря effects/state или опасность незавершения; P2 — локальная
ошибка обычной фичи/диагностики. Priority не утверждает невозможность других failures.

## Новые observations

| ID  | Priority | Статус/mode          | Expected → actual                                                                                     | Семейство     |
| --- | -------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| R01 | P1       | observed/script      | skipped RHS/branch: count 0 → 1 у `&&`, `??`, ternary с extracted optional chain                      | EXPR          |
| R02 | P1       | observed/script      | arguments trace `AB                                                                                   | 3`→`BA        | 3`                                            | EXPR/CALL |
| R03 | P1       | observed/script      | while trace `3                                                                                        | 2`→`1         | 5` с guard; source call извлечён перед loop   | EXPR/ITER |
| R04 | P1       | observed/script      | assignment value `7                                                                                   | 7`→`undefined | 7`                                            | REF       |
| R05 | P1       | observed/script      | compound receiver/key trace `GKR                                                                      | 3`→`GKGKR     | 3`                                            | REF       |
| R06 | P1       | observed/module init | exported mutable value 2 → 1; captured exported value → `value not defined`                           | MOD/SCOPE     |
| R07 | P2       | observed/script      | arrow/function-expression default 7 → undefined; declaration explicit undefined 7 → undefined         | FUNC          |
| R08 | P2       | observed/script      | rest length 3 → `Unknown object property: Array`; emitted `bt.Array.slice`                            | FUNC/LIB      |
| R09 | P2       | observed/script      | lexical arrow this 3 → read of undefined error                                                        | FUNC/SCOPE    |
| R10 | P2       | observed/script      | `f?.()` for undefined → callable error instead of undefined                                           | CALL          |
| R11 | P2       | observed/script      | optional method with value 1 should throw → no throw                                                  | CALL          |
| R12 | P1       | observed/script      | destructuring source count 1 → 2; default repeats read/call too                                       | BIND          |
| R13 | P2       | observed/script      | nested binding b=3 → `b not defined`; compile succeeded                                               | BIND/TS       |
| R14 | P2       | observed/script      | template `"23"` → numeric 5                                                                           | LIT           |
| R15 | P2       | observed/script      | method in object with spread → dropped, callable error                                                | SPREAD/LIT    |
| R16 | P2       | observed/script      | implicit derived constructor field 7 → undefined                                                      | CLASS         |
| R17 | P2       | observed/script      | explicit undefined deleteCount leaves array intact → deletes tail                                     | LIB           |
| R18 | P2       | observed/script      | reduce with explicit undefined initial value calls callback 2 times → 1                               | LIB           |
| R19 | P2       | observed/script      | copyWithin end=0 should not copy → `[1,1,2]`                                                          | LIB           |
| R20 | P2       | observed/script      | number.toFixed → missing Number polyfill error                                                        | LIB           |
| R21 | P2       | observed/script      | tuple join → callable error; readonly number[] control passed                                         | LIB/TS        |
| R22 | P2       | observed/bare        | source `__lit0` remains 7 → overwritten by literal-extract                                            | SAFE          |
| R23 | P2       | observed/script      | `**`, `                                                                                               |               | =` compile successfully → target syntax error | TS/SAFE   |
| R24 | P2       | observed/script      | postfix property update → BT90005 rejection; delete property → invalid native argument                | REF           |
| R25 | P2       | observed/script      | string for-of → not-an-array error; array for-in keys `0;1;` → values `10;20;`                        | ITER          |
| R26 | P2       | observed/script      | typeof source function should be `function` → runtime generic error                                   | FUNC/TS       |
| R27 | P2       | code-only            | default import reads `__default`, export assignment writes `default`; end-to-end reproduction pending | MOD           |

R06 проверяет initializer через `__init(lib, module)` в JS probe; полный
двухфайловый require/codelibrary pipeline ещё не проверен этим case.
R24 update rejection — missing lowering, не silent miscompile. R25/R26 требуют
native capability probes для разделения compiler/helper/runtime responsibilities.
Сообщения errors сокращены до первой строки; exact stacks не являются contract.

## Seed sources: core

В sources ниже результат — `result`. Для oracle: TS → JS через TypeScript, затем
Node VM. Для target: `compile(..., {mode: 'script', tsCompilerOptions: {strict: false}})`,
реальный BS execution с `return result`. Generated function descriptors — не Node JS.
Для R06/R22 использовать явно указанные modes. После переноса желательно также
проверить strict-valid typed variants, не выключая TS checks ради получения output.

### R01. Ленивость

```typescript
var count = 0;
function make() {
  count = count + 1;
  return { x: 9 };
}
var value = false && make()?.x;
var result = "" + count + "|" + value;
// Node: 0|false; BS: 1|false
```

Варианты той же семьи: `true ? 7 : make()?.x` → `0|7` / `1|7`;
`var left: number | undefined = 7; var value = left ?? make()?.x` → `0|7` / `1|7`.
Не использовать constant `7 ?? ...` в strict oracle: TS может отклонить unreachable RHS.

### R02. Порядок аргументов

```typescript
var trace = "";
function first() {
  trace += "A";
  return 1;
}
function second() {
  trace += "B";
  return { x: 2 };
}
function add(a: number, b: number) {
  return a + b;
}
var value = add(first(), second()?.x);
var result = trace + "|" + value;
// Node: AB|3; BS: BA|3
```

### R03. Частота loop condition

```typescript
var count = 0;
var guard = 0;
function next() {
  count = count + 1;
  return { v: count < 3 ? 1 : 0 };
}
while (next()?.v !== 0) {
  guard++;
  if (guard >= 5) break;
}
var result = "" + count + "|" + guard;
// Node: 3|2; BS: 1|5. Без guard можно не дождаться результата.
```

Наблюдаемый output вычисляет `__oc = <next optional chain>` до `while (__oc !== 0)`.
Цель fix — восстановить source evaluation point, не добавить guard в production.

### R04/R05. Assignment/reference

```typescript
var obj = { x: 1 };
var value = (obj.x = 7);
var result = "" + value + "|" + obj.x;
// Node: 7|7; BS: undefined|7
```

```typescript
var trace = "";
var obj = { x: 1 };
function get() {
  trace += "G";
  return obj;
}
function key() {
  trace += "K";
  return "x";
}
function rhs() {
  trace += "R";
  return 2;
}
get()[key()] += rhs();
var result = trace + "|" + obj.x;
// Node: GKR|3; BS: GKGKR|3
```

R04: helper `setProperty` делает `return;`. R05: emitter получает дублированные
receiver/key expressions для read и write. Проверить ещё exceptions/aliasing.

### R06. Module export

```typescript
export var value = 1;
value = 2;
// После init exported value должен отражать 2, observed 1.
```

```typescript
export var value = 1;
export function read() {
  return value;
}
// Output: __env.value = 1; __module.exports.value = value;
// Native value binding не объявлен: observed init error.
```

### R12/R13. Destructuring

```typescript
var count = 0;
function make() {
  count = count + 1;
  return { a: 1, b: 2 };
}
var { a, b } = make();
var result = "" + count + "|" + a + "|" + b;
// Node: 1|1|2; BS: 2|1|2
```

Default variant `var {a=9}=make()` при defined a также вызывает make дважды.
Nested variant `var {a:{b}}={a:{b:3}}; var result=""+b` принят, но b отсутствует.

## Остальные seed sources

Это отдельные программы, не statements одного общего scope:

| ID  | Source                                                                                                                                          | Expected / actual                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| R07 | `var f=(x=7)=>x; var result=""+f();`                                                                                                            | `7` / `undefined`                           |
| R07 | `var f=function(x=7){return x;}; var result=""+f();`                                                                                            | `7` / `undefined`                           |
| R07 | `function f(x=7){return x;} var result=""+f(undefined);`                                                                                        | `7` / `undefined`                           |
| R08 | `function f(...args:number[]){return args.length;} var result=""+f(1,2,3);`                                                                     | `3` / missing Array helper                  |
| R09 | `var obj={x:3,make(){return ()=>this.x;}}; var f=obj.make(); var result=""+f();`                                                                | `3` / undefined receiver error              |
| R10 | `var f:((x:number)=>number)\|undefined=undefined; var result=""+f?.(3);`                                                                        | `undefined` / callable error                |
| R11 | `var obj:any={m:1};var result="";try{obj.m?.();result="no-throw";}catch(e){result="throw";}`                                                    | `throw` / `no-throw`                        |
| R14 | ``var result = `${2}${3}`;``                                                                                                                    | string `23` / number `5`                    |
| R15 | `var obj={...{x:3},read(){return this.x;}}; var result=""+obj.read();`                                                                          | `3` / dropped method                        |
| R16 | `class A{x:number;constructor(x:number){this.x=x;}}class B extends A{}var obj=new B(7);var result=""+obj.x;`                                    | `7` / `undefined`                           |
| R17 | `var arr=[1,2,3];var removed=arr.splice(1,undefined);var result=arr.join(",")+"\|"+removed.join(",");`                                          | `1,2,3\|` / `1\|2,3`                        |
| R18 | `var arr=[1,2];var calls=0;var value=arr.reduce(function(acc:any,v:number){calls=calls+1;return v;},undefined);var result=""+calls+"\|"+value;` | `2\|2` / `1\|2`                             |
| R19 | `var arr=[1,2,3];arr.copyWithin(1,0,0);var result=arr.join(",");`                                                                               | `1,2,3` / `1,1,2`                           |
| R20 | `var n=1.5;var result=n.toFixed(1);`                                                                                                            | `1.5` / missing Number polyfill             |
| R21 | `var arr:[number,number]=[1,2];var result=arr.join(",");`                                                                                       | `1,2` / callable error                      |
| R22 | `function probe(){var __lit0=7;var value=[1,2].length;return __lit0===7;}var result=probe();`                                                   | bare: `true` / `false`                      |
| R23 | `var result=2 ** 3;` or `var x=0;x \|\|= 7;var result=x;`                                                                                       | `8` or `7` / accepted target syntax error   |
| R24 | `var obj={x:1};var value=obj.x++;var result=""+value+"\|"+obj.x;`                                                                               | `1\|2` / BT90005                            |
| R24 | `var obj:any={x:1};var value=delete obj.x;var result=""+value+"\|"+obj.x;`                                                                      | `true\|undefined` / invalid delete argument |
| R25 | `var out="";for(var v of "ab"){out=out+v;}var result=out;`                                                                                      | `ab` / not-an-array error                   |
| R25 | `var out="";var arr=[10,20];for(var key in arr){out=out+key+";";}var result=out;`                                                               | `0;1;` / `10;20;`                           |
| R26 | `function f(){return 1;}var result=typeof f;`                                                                                                   | `function` / generic runtime error          |

GFM `\|` в таблице — escape для отображения обычного `|`, не часть TS source.
При переносе сохранять literal input в файле/JS string, не копировать Markdown escape.

R22 first attempt использовал string receiver и упал на native `.length`;
подтверждённый array variant выше устраняет это смешение причин.

## Ранее documented findings

Эти случаи взяты из reference; в новом плане пока не воспроизведены отдельным runner.

| ID  | Проблема                                                                      | Следующая работа                                                        |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| K01 | Multiple declarations в classic for init: сохраняется только первая, #28      | ITER tasks, effects даже при zero iterations                            |
| K02 | Runtime enum declaration удаляется, member reads остаются                     | TS contract + enum implementation или explicit agreed boundary          |
| K03 | Namespace body пропускается/flattened без object semantics, Warning           | TS contract + runtime namespace decision                                |
| K04 | Bare optional chain может давать `__invalid__` без Error                      | Mode/diagnostic contract, не копировать script ABI в bare автоматически |
| K05 | Bare destructuring/default/rest incomplete                                    | BIND/FUNC mode matrix и runtime bootstrap                               |
| K06 | Explicit undefined default не применяется                                     | R07, argument-presence model                                            |
| K07 | Short-circuit с extracted RHS нарушен                                         | R01, EXPR core                                                          |
| K08 | Classic for-let header captures могут падать/не иметь per-iteration semantics | SCOPE/ITER                                                              |
| K09 | `fn!()` и type wrappers обходят descriptor call lowering                      | CALL/TS erasure                                                         |
| K10 | Hex integer с E/e теряет raw precision при Number normalization               | LIT numeric + separate JS/platform precision contract                   |
| K11 | Async/generator modifiers, class members и `$` могут теряться без rejection   | Exhaustive TS/source validation                                         |

## Правило обновления реестра

Новая находка получает ID, literal source, expected/actual/mode, evidence label,
affected rule/task, compiler/runtime identity. `fixed` ставится только со ссылками
на permanent regression и result manifest. Нельзя закрыть несколько разных R IDs
одним общим «tests green», не проверив их индивидуальные acceptance cases.
