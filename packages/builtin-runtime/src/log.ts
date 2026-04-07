export namespace bt {
  export function verbose(message: string): void {
    log(message, 0, "VERBOSE");
  }

  export function debug(message: string): void {
    log(message, 1, "DEBUG  ");
  }

  export function info(message: string): void {
    log(message, 2, "INFO   ");
  }

  export function warning(message: string): void {
    log(message, 3, "WARNING");
  }

  export function error(message: string): void {
    log(message, 4, "ERROR  ");
  }

  function log(message: string, level: number, levelName: string): void {
    alert("[bt.runtime]  " + levelName + "  " + message);
  }
}
