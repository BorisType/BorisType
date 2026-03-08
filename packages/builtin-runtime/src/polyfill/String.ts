export function at(str: string, index: number): string | undefined {
  const len = StrCharCount(str);
  const normalizedIndex = Int(index);

  if (normalizedIndex < 0) {
    const positiveIndex = len + normalizedIndex;
    return positiveIndex >= 0 ? str.charAt(positiveIndex) : undefined;
  }

  return normalizedIndex < len ? str.charAt(normalizedIndex) : undefined;
}

export function substr(str: string, start: number, length: number | undefined): string {
  const strLen = StrCharCount(str);
  const normalizedStart = Int(start);
  const normalizedLength = length !== undefined ? Int(length) : strLen;

  let actualStart = normalizedStart >= 0 ? normalizedStart : strLen + normalizedStart;

  if (actualStart < 0) {
    actualStart = 0;
  }

  if (actualStart >= strLen) {
    return "";
  }

  const maxLength = strLen - actualStart;
  const actualLength = normalizedLength < 0 ? 0 : Min(normalizedLength, maxLength);

  return StrCharRangePos(str, actualStart, actualStart + actualLength);
}

// вообще лучше вызывать напрямую, но пока мы делаем так + потом надо будет обрабатывать литералы, тут как раз будет хорошо
export function split(str: string, separator: string): string[] {
  return str.split(separator);
}

export function trim(str: string): string {
  return Trim(str);
}

export function trimEnd(str: string): string {
  let end = StrCharCount(str);
  while (end > 0 && isWhitespace(str.charAt(end - 1))) {
    end--;
  }

  return StrCharRangePos(str, 0, end);
}

export function trimStart(str: string): string {
  let start = 0;
  const len = StrCharCount(str);
  while (start < len && isWhitespace(str.charAt(start))) {
    start++;
  }

  return StrCharRangePos(str, start, len);
}

function isWhitespace(char: string): boolean {
  return (
    char === " " ||
    char === "\t" ||
    char === "\n" ||
    char === "\r" ||
    char === "\f" ||
    char === "\v"
  );
}
