export function entries<T>(obj: { [key: string]: T }): [string, T][] {
    return Object.keys(obj).map(key => [key, obj[key]]);
}