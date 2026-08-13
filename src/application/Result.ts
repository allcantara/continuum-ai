export type FailureCode = 'not_found' | 'invalid';

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: E; readonly code?: FailureCode };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(reason: E, code?: FailureCode): Result<never, E> {
  if (code === undefined) {
    return { ok: false, reason };
  }
  return { ok: false, reason, code };
}
