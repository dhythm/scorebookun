export const MIN_DELETE_KEY_LENGTH = 4;
export const MAX_DELETE_KEY_LENGTH = 100;

export type ParsedDeleteKey = { ok: true; key: string | null } | { ok: false };

/** A missing or blank key means "no key"; anything else must fit the limits. */
export function parseDeleteKey(value: unknown): ParsedDeleteKey {
  if (value === undefined || value === null) return { ok: true, key: null };
  if (typeof value !== "string") return { ok: false };
  const key = value.trim();
  if (key.length === 0) return { ok: true, key: null };
  if (
    key.length < MIN_DELETE_KEY_LENGTH ||
    key.length > MAX_DELETE_KEY_LENGTH
  ) {
    return { ok: false };
  }
  return { ok: true, key };
}
