const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let verbose = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function debug(...args: unknown[]): void {
  if (verbose) {
    console.error(`${DIM}[debug]${RESET}`, ...args);
  }
}

export function info(...args: unknown[]): void {
  console.error(...args);
}

export function error(...args: unknown[]): void {
  console.error("\x1b[31m[error]\x1b[0m", ...args);
}

export function warn(...args: unknown[]): void {
  console.error("\x1b[33m[warn]\x1b[0m", ...args);
}
