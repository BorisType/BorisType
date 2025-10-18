function ___btt_Array_arrayAt(array, index) {
  if (array === undefined || array === null || !IsArray(array)) return undefined;
  var len = ArrayCount(array);
  var normalizedIndex = Int(index);
  if (normalizedIndex < 0) {
    var positiveIndex = len + normalizedIndex;
    return positiveIndex >= 0 ? array[positiveIndex] : undefined;
  }
  return normalizedIndex < len ? array[normalizedIndex] : undefined;
}

function ___btt_Array_arrayCopyWithin(array, target, start, end) {
  if (array === undefined || array === null || !IsArray(array)) return undefined;
  var len = ArrayCount(array);
  var to = Int(target);
  var from = Int(start);
  var final = OptInt(end) ? Int(end) : len;
  var normalizedTarget = to < 0 ? Max(len + to, 0) : Min(to, len);
  var normalizedStart = from < 0 ? Max(len + from, 0) : Min(from, len);
  var normalizedEnd = final < 0 ? Max(len + final, 0) : Min(final, len);
  var count = Min(normalizedEnd - normalizedStart, len - normalizedTarget);
  if (count > 0) {
    if (normalizedStart < normalizedTarget && normalizedTarget < normalizedStart + count) {
      var i_loop1 = undefined;
      for (i_loop1 = count - 1; i_loop1 >= 0; i_loop1--) array[normalizedTarget + i_loop1] = array[normalizedStart + i_loop1];
    } else {
      var i_loop2 = undefined;
      for (i_loop2 = 0; i_loop2 < count; i_loop2++) array[normalizedTarget + i_loop2] = array[normalizedStart + i_loop2];
    }
  }
  return array;
}

function ___btt_Array_arrayFill(array, value, start, end) {
  if (array === undefined || array === null || !IsArray(array)) return array;
  var len = ArrayCount(array);
  var normalizedStart = start === undefined ? 0 : Int(start);
  var normalizedEnd = end === undefined ? len : Int(end);
  var from = normalizedStart < 0 ? Max(len + normalizedStart, 0) : Min(normalizedStart, len);
  var to = normalizedEnd < 0 ? Max(len + normalizedEnd, 0) : Min(normalizedEnd, len);
  var i_loop3 = undefined;
  for (i_loop3 = from; i_loop3 < to; i_loop3++) array[i_loop3] = value;
  return array;
}