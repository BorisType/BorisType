function ___btp_object_rest(obj, exclude) {
    var newObj = {};
    var key;
    for (key in obj) {
        if (exclude.indexOf(key) >= 0) continue;
        newObj[key] = obj[key];
    }
    return newObj;
}

function ___btp_array_rest(arr, start) {
    var newArr = [];
    var i = start;
    for (; i < arr.length; i++) {
        newArr.push(arr[i]);
    }
    return newArr;
}