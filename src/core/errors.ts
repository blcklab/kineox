import type { KineoxErrorCode, KineoxErrorInfo } from './types.js';

export class KineoxError extends Error implements KineoxErrorInfo {
  readonly code: KineoxErrorCode;
  readonly recoverable: boolean;
  override readonly cause: unknown;

  constructor(code: KineoxErrorCode, message: string, recoverable = false, cause?: unknown) {
    super(message, { cause });
    this.name = 'KineoxError';
    this.code = code;
    this.recoverable = recoverable;
    this.cause = cause;
  }
}

export function kineoxError(
  code: KineoxErrorCode,
  message: string,
  recoverable = false,
  cause?: unknown
): KineoxError {
  return new KineoxError(code, message, recoverable, cause);
}

export function errorName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('name' in value)) return;
  return typeof value.name === 'string' ? value.name : undefined;
}

export function asErrorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}
