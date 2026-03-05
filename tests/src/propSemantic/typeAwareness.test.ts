// Test type awareness with optional chaining
// This test verifies type-aware property access without runtime assertions

function dummy(xml: CollaboratorDocument) {
    xml.TopElem.code.Value;
    const code: XmlElem<unknown> = xml.TopElem.code;
}

function dd(d: XmlElem<unknown>) {
    // Type check function
}


botest.assertOk();

export {};
