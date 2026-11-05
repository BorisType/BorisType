/** Deterministic completion algebra fixtures shared by JS and C probes. */
import { forUpdateCases } from "./for-update-cases.mjs";
function action(kind, value) {
  switch (kind) {
    case "normal":
      return "trace += 'N';";
    case "return":
      return `return '${value}';`;
    case "throw":
      return `throw '${value}';`;
    case "break":
      return "break outer;";
    case "continue":
      return "continue outer;";
    default:
      throw new Error(`Unknown completion: ${kind}`);
  }
}

function contain(body, container) {
  switch (container) {
    case "block":
      return `{ ${body} }`;
    case "if":
      return `if (i >= 0) { ${body} } else { trace += 'bad'; }`;
    case "for":
      return `for (var j = 0; j < 1; j++) { ${body} }`;
    case "while":
      return `var j = 0; while (j++ < 1) { ${body} }`;
    case "do":
      return `do { ${body} } while (false);`;
    case "switch":
      return `switch (i) { case 0: ${body} break; default: ${body} }`;
    default:
      throw new Error(`Unknown container: ${container}`);
  }
}

/** Each case terminates and reports both side effects and completion outcome. */
export function abruptCases() {
  const cases = [];
  for (const pending of ["normal", "return", "throw", "break", "continue"]) {
    for (const replacement of ["normal", "return", "throw", "break", "continue"]) {
      for (const origin of ["try", "catch", "finalizer"]) {
        for (const container of ["block", "if", "for", "while", "do", "switch"]) {
          for (let depth = 0; depth <= 3; depth++) {
            const first = `trace += 'T'; ${action(pending, "R")}`;
            const protectedBody =
              origin === "try"
                ? first
                : origin === "catch"
                  ? `try { throw 'start'; } catch (caught) { trace += 'C'; ${first} }`
                  : `try { trace += 'I'; } finally { ${first} }`;
            let body = `try { ${protectedBody} } finally { trace += 'F'; ${action(replacement, "Q")} }`;
            for (let level = 0; level < depth; level++) body = `try { ${body} } finally { trace += '${level}'; }`;
            cases.push({
              name: `${pending}-${replacement}-${origin}-${container}-${depth}`,
              body: `outer: for (var i = 0; i < 2; i++) { ${contain(body, container)} trace += 'A'; } return 'E';`,
            });
          }
        }
      }
    }
  }
  cases.push(
    { name: "chained-labels", body: "a: b: for(var i=0;i<3;i++){trace+=i;if(i<2)continue a;break b;}return 'E';" },
    { name: "label-if", body: "done: if(true){trace+='A';break done;trace+='bad';}trace+='B';return 'E';" },
    { name: "label-try", body: "done: try{trace+='A';break done;}finally{trace+='F';}trace+='B';return 'E';" },
    {
      name: "switch-fallthrough",
      body: "outer: for(var i=0;i<3;i++){switch(i){case 0:trace+='A';case 1:try{trace+='B';continue outer;}finally{trace+='F';}default:trace+='C';break;}trace+='D';}return 'E';",
    },
    {
      name: "switch-default-middle",
      body: "outer: for(var i=0;i<2;i++){switch(i){case 9:trace+='bad';break;default:trace+='D';case 0:try{trace+='A';break;}finally{trace+='F';}case 1:trace+='bad';}trace+='Z';}return 'E';",
    },
    {
      name: "local-jumps-in-finalizer",
      body: "try{return 'R';}finally{for(var i=0;i<3;i++){if(i===0)continue;if(i===2)break;trace+=i;}inside:{trace+='L';break inside;}trace+='F';}",
    },
    { name: "caught-finalizer-throw", body: "try{try{return 'R';}finally{throw 'F';}}catch(e){trace+='C';}trace+='A';return 'E';" },
    {
      name: "caught-finalizer-break-throw",
      body: "outer: for(var i=0;i<2;i++){try{try{break outer;}finally{throw 'F';}}catch(e){trace+='C';}trace+='A';}return 'E';",
    },
    {
      name: "caught-finalizer-continue-throw",
      body: "outer: for(var i=0;i<2;i++){try{try{continue outer;}finally{throw 'F';}}catch(e){trace+='C';}trace+='A';}return 'E';",
    },
    { name: "local-catch-preserves-return", body: "try{return 'R';}finally{try{throw 'local';}catch(e){trace+='C';}trace+='F';}" },
    { name: "local-catch-preserves-throw", body: "try{throw 'outer';}finally{try{throw 'local';}catch(e){trace+='C';}trace+='F';}" },
    { name: "caught-throw-expression", body: "try{try{return fail();}catch(e){trace+='C';return 'R';}}finally{trace+='F';}" },
    { name: "for-update", body: "outer: for(var i=0;i<3;trace+='U',i++){try{trace+=i;continue outer;}finally{trace+='F';}}return 'E';" },
    { name: "do-condition", body: "var i=0;outer:do{try{trace+=i;i++;continue outer;}finally{trace+='F';}}while(i<3);return 'E';" },
    { name: "nested-source-catch", body: "try{try{throw 'X';}finally{trace+='F';}}catch(e){trace+='C';}return 'E';" },
    {
      name: "catch-binding-parameter",
      params: "error: string",
      body: "try{throw 'X';}catch(error){error='inner';trace+=error;}trace+=error;return 'E';",
    },
    {
      name: "catch-binding-nested-block",
      body: "var error='outer';try{throw 'X';}catch(error){error='inner';{let error='block';trace+=error;}trace+=error;}trace+=error;return 'E';",
    },
    { name: "return-undefined", body: "try{return;}finally{trace+='F';}" },
    { name: "return-false", body: "try{return false;}finally{trace+='F';}" },
    {
      name: "for-of-finalizer",
      body: "outer: for(const item of [1,2,3]){try{trace+=item;if(item===1)continue outer;break outer;}finally{trace+='F';}}return 'E';",
    },
    { name: "label-empty", body: "empty:;done:{trace+='A';break done;}return 'E';" },
    {
      name: "finalizer-catches-nested-finalizer",
      body: "try{return 'R';}finally{try{try{throw 'nested';}finally{trace+='I';}}catch(e){trace+='C';}trace+='F';}",
    },
    {
      name: "recursive-finalizers",
      body: "function recurse(n:number,ledger:{value:string}):string{try{if(n>0)return recurse(n-1,ledger);return 'R';}finally{trace+=n;}}return recurse(3,ledger);",
    },
  );
  return cases.concat(forUpdateCases());
}

/** Independent worker/check functions avoid comparing platform exception values. */
export function caseSource(cases) {
  return `function fail(): never { throw 'X'; }
    ${cases
      .map(
        (item, index) => `
      function work${index}(ledger: {value: string}${item.params ? ", " + item.params : ""}): any { ${item.body.replace(/\btrace\b/g, "ledger.value")} }
      function check${index}(): string {
        var ledger = {value: ''};
        var outcome = '';
        try { outcome = '' + work${index}(ledger${item.params ? ", 'outer'" : ""}); }
        catch (escaped) { outcome = 'X'; }
        return ledger.value + '|' + outcome;
      }
    `,
      )
      .join("\n")}
    function runAll(): string {
      var result = '';
      ${cases.map((_, index) => `result += check${index}() + '\\n';`).join("\n")}
      return result;
    }`;
}
