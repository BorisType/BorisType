import { TCache } from "./prelude";

export namespace bt {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let cache: Object = {};

    export function init_cache() {
        const cacheLibrary = OpenCodeLibrary<TCache>('./cache/index.js');
        cacheLibrary.init();

        cache = cacheLibrary;
    }
}
