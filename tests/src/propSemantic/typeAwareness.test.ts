// The suite checks that generated XML property access stays direct.

function dummy(xml: CollaboratorDocument) {
  xml.TopElem.code.Value;
  const code: XmlElem<unknown> = xml.TopElem.code;
}

function dd(d: XmlElem<unknown>) {
  // Type check function
}

botest.assertOk();

export {};
