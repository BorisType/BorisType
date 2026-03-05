let storage: Object = {};

export function set(key: string, value: any): any {
    storage.SetProperty(key, value);
    return value;
}

export function get(key: string): any {
    return storage.GetOptProperty(key);
}

export function has(key: string): boolean {
    return storage.HasProperty(key);
}

export function init() {
    storage = new SafeObject();
}
