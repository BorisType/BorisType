export function assign<T, U>(target: T, source: U): T & U {
    throw "Not implemented";
}

export function defineProperties<T>(obj: T, properties: PropertyDescriptorMap & ThisType<any>): T {
    throw "Not implemented";
}

export function defineProperty<T>(obj: T, key: PropertyKey, descriptor: PropertyDescriptor): T {
    throw "Not implemented";
}

export function entries<T>(obj: { [key: string]: T }): [string, T][] {
    throw "Not implemented";
    // return Object.keys(obj).map(key => [key, obj[key]]);
}

export function fromEntries<T>(entries: [string, T][]): { [key: string]: T } {
    throw "Not implemented";
}

export function groupBy<T, K extends PropertyKey>(list: T[], keyGetter: (item: T) => K): { [key in K]: T[] } {
    throw "Not implemented";
}

export function keys<T>(obj: T): (keyof T)[] {
    throw "Not implemented";
}

export function values<T>(obj: { [key: string]: T }): T[] {
    throw "Not implemented";
}