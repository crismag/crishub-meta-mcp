import { inspect } from 'node:util';
import { REDACTED, registerSecret } from './redact.js';

/**
 * Opaque wrapper for credentials. Serialising, logging or string-concatenating
 * a SecretToken yields "[REDACTED]"; only `reveal()` returns the value, and
 * that call is confined to the Graph transport.
 */
export class SecretToken {
  readonly #value: string;

  constructor(value: string) {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new TypeError('SecretToken requires a non-empty string');
    }
    this.#value = value.trim();
    registerSecret(this.#value);
  }

  /** Transport-internal. Never pass the result to logs, errors or tool output. */
  reveal(): string {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [inspect.custom](): string {
    return `SecretToken(${REDACTED})`;
  }
}
