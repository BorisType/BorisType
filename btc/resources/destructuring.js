function ___btp_object_rest(obj, exclude) {
    var newObj = {};
    for (var key in obj) {
        if (exclude.indexOf(key) >= 0) continue;
        newObj[key] = obj[key];
    }
    return newObj;
}

function ___btp_array_rest(arr, start) {
    var newArr = [];
    for (var i = start; i < arr.length; i++) {
        newArr.push(arr[i]);
    }
    return newArr;
}