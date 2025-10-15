function ___btt_Math_abs(num) {
    if (num < 0) {
        return -num;
    } else {
        return num;
    }
}

function ___btt_Math_ceil(num) {
    var temp;
    if (num < 0) {
        temp = Math.round(-num);
        return -(temp > -num ? temp - 1 : temp);
    } else {
        temp = Math.round(num);
        return temp < num ? temp + 1 : temp;
    }   
}

function ___btt_Math_floor(num) {
    if (num < 0) {
        return -(Math.round(-num) < -num ? Math.round(-num) + 1 : Math.round(-num));
    }
    return Math.round(num) > num ? Math.round(num) - 1 : Math.round(num);
}

function ___btt_Math_trunc(num) {
    if (num < 0) {
        return -(Math.round(-num) > -num ? Math.round(-num) - 1 : Math.round(-num));
    }
    return Math.round(num) > num ? Math.round(num) - 1 : Math.round(num);
}