import { Polyfill, TArray, Tdestructuring, TMath, TObject, TString } from "./prelude";

export namespace bt {
    let polyfill: Polyfill;

    export function init_polyfill() {
        const ArrayPolyfill = OpenCodeLibrary<TArray>('./polyfill/Array.js');
        const MathPolyfill = OpenCodeLibrary<TMath>('./polyfill/Math.js');
        const ObjectPolyfill = OpenCodeLibrary<TObject>('./polyfill/Object.js');
        const StringPolyfill = OpenCodeLibrary<TString>('./polyfill/String.js');
        const destructuringPolyfill = OpenCodeLibrary<Tdestructuring>('./polyfill/destructuring.js');

        polyfill = {
            Array: ArrayPolyfill,
            Math: MathPolyfill,
            Object: ObjectPolyfill,
            String: StringPolyfill,
            destructuring: destructuringPolyfill,
        };
    }
}