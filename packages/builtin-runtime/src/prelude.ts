import * as ArrayPolyfill from './polyfill/Array';
import * as MathPolyfill from './polyfill/Math';
import * as ObjectPolyfill from './polyfill/Object';
import * as StringPolyfill from './polyfill/String';
import * as cache from './cache/index';

export type TArray = typeof ArrayPolyfill;
export type TMath = typeof MathPolyfill;
export type TObject = typeof ObjectPolyfill;
export type TString = typeof StringPolyfill;
export type TCache = typeof cache;

export type Polyfill = {
    Array: TArray;
    Math: TMath;
    Object: TObject;
    String: TString;
};

export type BtType = {
    init_polyfill: () => void;
    init_require: () => void;
    init_cache: () => void;
}

export declare const bt: BtType;