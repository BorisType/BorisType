const untouchable = Symbol('untouchable');

export function markUntouchable<T>(obj: T): T {
  (obj as any)[untouchable] = true;
  return obj;
}

export function isUntouchable(obj: any): boolean {
  return obj && obj[untouchable] === true;
}