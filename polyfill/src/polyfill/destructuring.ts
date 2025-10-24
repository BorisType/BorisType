export function object_rest(obj: Object, exclude: string[]): Object {
    const newObj = {};

    for (const key in obj) {
        if (exclude.indexOf(key) >= 0) continue;
        newObj.SetProperty(key, obj.GetProperty(key));
    }

    return newObj;
}

export function array_rest(arr: Array<any>, start: number): Array<any> {
    const newArr = [];

    for (let i = start; i < arr.length; i++) {
        newArr.push(arr[i]);
    }
    
    return newArr;
}