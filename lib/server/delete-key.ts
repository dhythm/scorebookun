import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCHEME = "scrypt";
const SALT_BYTES = 16;
const HASH_BYTES = 32;

function derive(key: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(key.normalize("NFKC"), salt, HASH_BYTES, (error, derived) =>
      error ? reject(error) : resolve(derived)
    );
  });
}

export async function hashDeleteKey(key: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await derive(key, salt);
  return [SCHEME, salt.toString("base64url"), hash.toString("base64url")].join(
    "$"
  );
}

export async function verifyDeleteKey(
  key: string,
  stored: string
): Promise<boolean> {
  const [scheme, salt, hash, ...rest] = stored.split("$");
  if (scheme !== SCHEME || !salt || !hash || rest.length > 0) return false;
  const expected = Buffer.from(hash, "base64url");
  if (expected.length !== HASH_BYTES) return false;
  const actual = await derive(key, Buffer.from(salt, "base64url"));
  return timingSafeEqual(actual, expected);
}
