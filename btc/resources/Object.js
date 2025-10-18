// Object.assign(target)
function ___btt_Object_assign1NN(target) {
    return target;
}

// Object.assign(target, source1)
function ___btt_Object_assign2NN(target, source1) {
    return target;
}

// Object.assign(target, source1, source2, /* …, */ sourceN)
function ___btt_Object_assignNNN(target, sourceN) {
    return target;
}

// Object.defineProperties(obj, props)
function ___btt_Object_defineProperties(obj, props) {
    return obj;
}

// Object.defineProperty(obj, prop, -descriptor)
function ___btt_Object_defineProperty(obj, prop, descriptor) {
    return obj;
}

// Object.entries()
function ___btt_Object_entries(obj) {
    var entries = [];
    
    var key;
    var value;
    for (key in obj) {
        value = obj[key];
        entries.push([key, value]);
    }
    
    return entries;
}