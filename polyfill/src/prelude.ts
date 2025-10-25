import * as ArrayPolyfill from './polyfill/Array';
import * as MathPolyfill from './polyfill/Math';
import * as ObjectPolyfill from './polyfill/Object';
import * as StringPolyfill from './polyfill/String';
import * as destructuring from './polyfill/destructuring';

export type TArray = typeof ArrayPolyfill;
export type TMath = typeof MathPolyfill;
export type TObject = typeof ObjectPolyfill;
export type TString = typeof StringPolyfill;
export type Tdestructuring = typeof destructuring;

export type Polyfill = {
    Array: TArray;
    Math: TMath;
    Object: TObject;
    String: TString;
    destructuring: Tdestructuring;
};