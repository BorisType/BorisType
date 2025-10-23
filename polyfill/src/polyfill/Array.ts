export function at<T>(array: Array<T>, index: number): T | undefined {
  //   if (array === undefined || array === null || !IsArray(array)) throw 'arrayAt: first argument is not an array');

  const len = ArrayCount(array);
  const normalizedIndex = Int(index);

  if (normalizedIndex < 0) {
    const positiveIndex = len + normalizedIndex;
    return positiveIndex >= 0 ? array[positiveIndex] : undefined;
  }
  return normalizedIndex < len ? array[normalizedIndex] : undefined;
}

// function Concat = ArrayUnion

export function copyWithin<T>(array: Array<T>, target: number, start: number, end: number): Array<T> {
  //   if (array === undefined || array === null || !IsArray(array)) throw 'arrayCopyWithin: first argument is not an array');

  const len = ArrayCount(array);
  const to = Int(target);
  const from = Int(start);

  const final = OptInt(end) ? Int(end) : len;
  const normalizedTarget = to < 0 ? Max(len + to, 0) : Min(to, len);
  const normalizedStart = from < 0 ? Max(len + from, 0) : Min(from, len);
  const normalizedEnd = final < 0 ? Max(len + final, 0) : Min(final, len);
  const count = Min(normalizedEnd - normalizedStart, len - normalizedTarget);

  if (count > 0) {
    if (normalizedStart < normalizedTarget && normalizedTarget < normalizedStart + count) {
      for (let i = count - 1; i >= 0; i--) {
        array[normalizedTarget + i] = array[normalizedStart + i];
      }
    } else {
      for (let i = 0; i < count; i++) {
        array[normalizedTarget + i] = array[normalizedStart + i];
      }
    }
  }

  return array;
}

export function entries<T>(array: Array<T>): Array<[number, T]> {
  const result: Array<[number, T]> = [];
  for (let i = 0; i < ArrayCount(array); i++) {
    result.push([i, array[i]]);
  }
  return result;
}

export function fill<T>(array: Array<T>, value: T, start?: number, end?: number): Array<T> {
  //   if (array === undefined || array === null || !IsArray(array)) return array;

  const len = ArrayCount(array);
  const normalizedStart = start === undefined ? 0 : Int(start);
  const normalizedEnd = end === undefined ? len : Int(end);
  const from = normalizedStart < 0 ? Max(len + normalizedStart, 0) : Min(normalizedStart, len);
  const to = normalizedEnd < 0 ? Max(len + normalizedEnd, 0) : Min(normalizedEnd, len);

  for (let i = from; i < to; i++) {
    array[i] = value;
  }

  return array;
}

export function flat<T>(array: Array<T>, depth?: number): Array<T> {
  depth = depth === undefined ? 1 : Int(depth);

  const result: Array<T> = [];

  for (let i = 0; i < ArrayCount(array); i++) {
    const value = array[i];
    if (IsArray(value) && depth > 0) {
      const flattened = flat(value as Array<T>, depth - 1);
      for (const item of flattened) {
        result.push(item);
      }
    } else {
      result.push(value);
    }
  }

  return result;
}

export function includes<T>(array: Array<T>, searchElement: T, fromIndex?: number): boolean {
  const from = fromIndex === undefined ? 0 : Int(fromIndex);
  const len = ArrayCount(array);
  let startIndex = from >= 0 ? from : Max(len + from, 0);

  for (let i = startIndex; i < len; i++) {
    if (array[i] === searchElement) {
      return true;
    }
  }

  return false;
}

export function indexOf<T>(array: Array<T>, searchElement: T, fromIndex?: number): number {
  const from = fromIndex === undefined ? 0 : Int(fromIndex);
  const len = ArrayCount(array);
  let startIndex = from >= 0 ? from : Max(len + from, 0);

  for (let i = startIndex; i < len; i++) {
    if (array[i] === searchElement) {
      return i;
    }
  }

  return -1;
}

export function join<T>(array: Array<T>, separator?: string): string {
  separator = separator === undefined ? ',' : separator;

  let result = '';
  const len = ArrayCount(array);

  for (let i = 0; i < len; i++) {
    result += array[i];
    if (i < len - 1) {
      result += separator;
    }
  }

  return result;
}

export function keys<T>(array: Array<T>): Array<number> {
  const result: Array<number> = [];

  for (let i = 0; i < ArrayCount(array); i++) {
    result.push(i);
  }

  return result;
}

export function lastIndexOf<T>(array: Array<T>, searchElement: T, fromIndex?: number): number {
  const len = ArrayCount(array);
  const from = fromIndex === undefined ? len - 1 : Int(fromIndex);
  let startIndex = from >= 0 ? Min(from, len - 1) : len + from;

  for (let i = startIndex; i >= 0; i--) {
    if (array[i] === searchElement) {
      return i;
    }
  }

  return -1;
}

export function pop<T>(array: Array<T>): T | undefined {
  const len = ArrayCount(array);
  if (len === 0) return undefined;
  const value = array[len - 1];

  array.splice(len - 1, 1);

  return value;
}

// export function push<T>(array: Array<T>, other: Array<T>) {
//   for (const item of other) {
//     array.push()
//   }
// }

export function reverse<T>(array: Array<T>): Array<T> {
  const len = ArrayCount(array);
  const mid = Int(len / 2);

  for (let i = 0; i < mid; i++) {
    const oppositeIndex = len - i - 1;
    const temp = array[i];
    array[i] = array[oppositeIndex];
    array[oppositeIndex] = temp;
  }

  return array;
}

export function shift<T>(array: Array<T>): T | undefined {
  const len = ArrayCount(array);
  if (len === 0) return undefined;
  const value = array[0];

  array.splice(0, 1);

  return value;
}

export function slice<T>(array: Array<T>, start?: number, end?: number): Array<T> {
  const len = ArrayCount(array);
  const normalizedStart = start === undefined ? 0 : Int(start);
  const normalizedEnd = end === undefined ? len : Int(end);
  const from = normalizedStart < 0 ? Max(len + normalizedStart, 0) : Min(normalizedStart, len);
  const to = normalizedEnd < 0 ? Max(len + normalizedEnd, 0) : Min(normalizedEnd, len);

  const result: Array<T> = [];

  for (let i = from; i < to; i++) {
    result.push(array[i]);
  }

  return result;
}

export function sort<T>(array: Array<T>, compareFn?: (a: T, b: T) => number): Array<T> {
  throw 'Array.sort polyfill is not implemented yet';
}

export function splice<T>(array: Array<T>, start: number, deleteCount: number | undefined, items: Array<T>): Array<T> {
  deleteCount = deleteCount === undefined ? ArrayCount(array) - start : Int(deleteCount);

  const len = ArrayCount(array);
  const normalizedStart = start < 0 ? Max(len + start, 0) : Min(start, len);
  const normalizedDeleteCount = Min(deleteCount, len - normalizedStart);

  const removed: Array<T> = [];
  for (let i = 0; i < normalizedDeleteCount; i++) {
    removed.push(array[normalizedStart + i]);
  }

  // Shift elements to the left
  for (let i = normalizedStart; i < len - normalizedDeleteCount; i++) {
    array[i] = array[i + normalizedDeleteCount];
  }

  // Shift elements to the right to make space for new items
  for (let i = len - normalizedDeleteCount - 1; i >= normalizedStart; i--) {
    array[i + items.length] = array[i];
  }

  // Insert new elements
  for (let i = 0; i < items.length; i++) {
    array[normalizedStart + i] = items[i];
  }

  var newLength = len - normalizedDeleteCount + items.length;
  var delta = ArrayCount(array) - newLength;
  
  // Resize the array
  // array.splice((len - normalizedDeleteCount + items.length), (len - normalizedDeleteCount));
  // array.length = len - normalizedDeleteCount + items.length;

  return removed;
}

export function toReversed<T>(array: Array<T>): Array<T> {
  const len = ArrayCount(array);
  const result: Array<T> = []; // new Array<T>(len)

  for (let i = 0; i < len; i++) {
    result[i] = array[len - i - 1];
  }

  return result;
}

export function toSorted<T>(array: Array<T>, compareFn?: (a: T, b: T) => number): Array<T> {
  throw 'Array.toSorted polyfill is not implemented yet';
}

// export function toSpliced<T>(array: Array<T>, start: number, deleteCount?: number, ...items: Array<T>): Array<T>

export function unshift<T>(array: Array<T>, items: Array<T>): number {
  throw 'Array.unshift polyfill is not implemented yet';
}

export function values<T>(array: Array<T>): Array<T> {
  return ArraySelectAll(array);
}
