/**
 * Базовое исключение для WSHCM-клиента
 */
export class WshcmException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WshcmException";
    Object.setPrototypeOf(this, WshcmException.prototype);
  }
}

/**
 * Исключение при ошибке авторизации
 */
export class UnauthorizedError extends WshcmException {
  constructor(message: string = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}
