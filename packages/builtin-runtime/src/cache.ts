import { TCache } from "./prelude";

export namespace bt {
    let cache: Object = {};

    export function init_cache() {
        const cacheLibrary = OpenCodeLibrary<TCache>('./cache/index.js');
        cacheLibrary.init();

        cache = cacheLibrary;
    }
}