/** Update normalization must implement the ForBodyEvaluation order, not a body tail. */
export function forUpdateCases() {
  const cases = [
    {
      name: "update-normal-order",
      body: "var i=0;for(trace+='I';i<3;trace+='U',i++,trace+='V'){trace+=i;}trace+='E';return i;",
    },
    {
      name: "update-condition-order",
      body: "var i=0;function test(i:number,ledger:{value:string}){trace+='T';return i<2;}for(;test(i,ledger);trace+='U',i++){trace+=i;}return i;",
    },
    { name: "update-zero-iterations", body: "for(var i=0;i<0;trace+='bad',i++){trace+='bad';}return i;" },
    { name: "update-native-continue", body: "for(var i=0;i<3;trace+='U',i++){trace+=i;continue;trace+='bad';}return i;" },
    {
      name: "update-switch-continue",
      body: "for(var i=0;i<3;trace+='U',i++){switch(i){case 0:trace+='A';continue;case 1:trace+='B';break;default:trace+='C';}trace+='D';}return i;",
    },
    {
      name: "update-nested-local-jumps",
      body: "for(var i=0;i<2;trace+='U',i++){for(var j=0;j<3;trace+='V',j++){if(j===0)continue;trace+=j;if(j===1)break;}trace+=i;}return i;",
    },
    {
      name: "update-outer-continue",
      body: "outer:for(var i=0;i<3;trace+='U',i++){for(var j=0;j<2;trace+='bad',j++){try{trace+=i;continue outer;}finally{trace+='F';}}}return i;",
    },
    {
      name: "update-chained-labels",
      body: "a:b:for(var i=0;i<3;trace+='U',i++){trace+=i;if(i<2)continue a;break b;}return i;",
    },
    {
      name: "update-break-skips",
      body: "for(var i=0;i<3;trace+='bad',i++){try{trace+=i;break;}finally{trace+='F';}}return i;",
    },
    {
      name: "update-return-skips",
      body: "for(var i=0;i<3;trace+='bad',i++){try{trace+=i;return 'R';}finally{trace+='F';}}return 'bad';",
    },
    {
      name: "update-throw-skips",
      body: "var i=0;try{for(i=0;i<3;trace+='bad',i++){try{trace+=i;throw 'X';}finally{trace+='F';}}}catch(e){trace+='C';}return i;",
    },
    {
      name: "update-exception-stops-sequence",
      body: "var i=0;try{for(i=0;i<3;trace+='U',fail(),i++,trace+='bad'){try{trace+=i;continue;}finally{trace+='F';}}}catch(e){trace+='C';}return i;",
    },
    {
      name: "update-exception-outer-finalizer",
      body: "try{for(var i=0;i<3;trace+='U',fail(),i++){try{trace+=i;continue;}finally{trace+='F';}}}finally{trace+='O';}return 'bad';",
    },
    {
      name: "update-condition-exception",
      body: "var i=0;function test(i:number,ledger:{value:string}){trace+='T';if(i===1)throw 'X';return true;}try{for(i=0;test(i,ledger);trace+='U',i++){try{trace+=i;continue;}finally{trace+='F';}}}catch(e){trace+='C';}return i;",
    },
    {
      name: "update-no-condition",
      body: "var i=0;for(; ;trace+='U',i++){trace+=i;if(i===2)break;continue;}return i;",
    },
    {
      name: "update-grouped-sequence",
      body: "for(var i=0;i<3;((trace+='U',i++),trace+='V')){trace+=i;continue;}return i;",
    },
    {
      name: "update-nested-assignment",
      body: "for(var i=0;i<3;i=(trace+='U',i+1)){trace+=i;continue;}return i;",
    },
    {
      name: "update-short-circuit",
      body: "for(var i=0;i<3;(i===0&&(trace+='A',trace+='B')),(i!==0||(trace+='C',trace+='D')),i++){trace+=i;}return i;",
    },
    {
      name: "update-conditional",
      body: "for(var i=0;i<3;(i===0?(trace+='A',trace+='B'):(trace+='C',trace+='D')),i++){trace+=i;}return i;",
    },
    {
      name: "update-in-call-argument",
      body: "function next(i:number,n:number){return i+n;}for(var i=0;i<3;i=next((trace+='U',i),1)){trace+=i;continue;}return i;",
    },
    {
      name: "update-outer-break",
      body: "outer:for(var i=0;i<3;trace+='bad',i++){for(var j=0;j<3;trace+='bad',j++){try{trace+='B';break outer;}finally{trace+='F';}}}return i;",
    },
    {
      name: "update-reenter-loop",
      body: "for(var j=0;j<2;j++){for(var i=0;i<2;trace+='U',i++){trace+=i;continue;}trace+='E';}return 'R';",
    },
  ];
  for (const pending of ["normal", "return", "throw", "break", "continue"]) {
    for (const replacement of ["normal", "return", "throw", "break", "continue"]) {
      for (const origin of ["try", "catch", "finalizer"]) {
        function action(kind, value) {
          if (kind === "normal") return "trace+='N';";
          if (kind === "return") return `return '${value}';`;
          if (kind === "throw") return `throw '${value}';`;
          return `${kind} outer;`;
        }
        const first = `trace+='T';${action(pending, "R")}`;
        const protectedBody =
          origin === "try"
            ? first
            : origin === "catch"
              ? `try{throw 'X';}catch(e){trace+='C';${first}}`
              : `try{trace+='I';}finally{${first}}`;
        cases.push({
          name: `update-${pending}-${replacement}-${origin}`,
          cProbe: false,
          body: `outer:for(var i=0;i<2;trace+='U',i++){try{try{${protectedBody}}finally{trace+='F';${action(replacement, "Q")}}}finally{trace+='O';}trace+='A';}return 'E';`,
        });
      }
    }
  }
  return cases;
}
