import {
    Polyfill,
    TArray,
    TObject,
    TString,
    TMath,
} from "./prelude";

export namespace bt {
    let polyfill: Polyfill;

    export function init_polyfill() {
        const ArrayPolyfill = OpenCodeLibrary<TArray>('./polyfill/Array.js');
        const ObjectPolyfill = OpenCodeLibrary<TObject>('./polyfill/Object.js');
        const StringPolyfill = OpenCodeLibrary<TString>('./polyfill/String.js');
        const MathPolyfill = OpenCodeLibrary<TMath>('./polyfill/Math.js');

        polyfill = {
            Array: ArrayPolyfill,
            Math: MathPolyfill,
            Object: ObjectPolyfill,
            String: StringPolyfill,
        };
    }
}