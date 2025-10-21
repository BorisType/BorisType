import * as ArrayPolyfill from './polyfill/Array';
import * as MathPolyfill from './polyfill/Math';
import * as ObjectPolyfill from './polyfill/Object';
import * as StringPolyfill from './polyfill/String';

export type TArray = typeof ArrayPolyfill;
export type TMath = typeof MathPolyfill;
export type TObject = typeof ObjectPolyfill;
export type TString = typeof StringPolyfill;

export type Polyfill = {
    Array: TArray;
    Math: TMath;
    Object: TObject;
    String: TString;
};