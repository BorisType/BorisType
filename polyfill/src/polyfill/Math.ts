export function abs(num: number): number {
    if (num < 0) {
        return -num;
    } else {
        return num;
    }
}

export function ceil(num: number): number {
    var temp;
    if (num < 0) {
        temp = Math.round(-num);
        return -(temp > -num ? temp - 1 : temp);
    } else {
        temp = Math.round(num);
        return temp < num ? temp + 1 : temp;
    }   
}

export function floor(num: number): number {
    if (num < 0) {
        return -(Math.round(-num) < -num ? Math.round(-num) + 1 : Math.round(-num));
    }
    return Math.round(num) > num ? Math.round(num) - 1 : Math.round(num);
}

export function trunc(num: number): number {
    if (num < 0) {
        return -(Math.round(-num) > -num ? Math.round(-num) - 1 : Math.round(-num));
    }
    return Math.round(num) > num ? Math.round(num) - 1 : Math.round(num);
}

export function random(): number {
    var value = Random(0, 65535);
    return value / 65535.0;
}