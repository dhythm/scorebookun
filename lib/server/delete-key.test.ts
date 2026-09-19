import { describe, expect, it } from "vitest";

import { hashDeleteKey, verifyDeleteKey } from "./delete-key";

describe("hashDeleteKey / verifyDeleteKey", () => {
  it("verifies the key it hashed", async () => {
    const hash = await hashDeleteKey("open sesame");

    await expect(verifyDeleteKey("open sesame", hash)).resolves.toBe(true);
    await expect(verifyDeleteKey("open sesame!", hash)).resolves.toBe(false);
  });

  it("never stores the key itself and salts every hash", async () => {
    const first = await hashDeleteKey("open sesame");
    const second = await hashDeleteKey("open sesame");

    expect(first).not.toContain("open sesame");
    expect(first).not.toBe(second);
  });

  it.each(["", "plain-text", "scrypt$only-salt", "bcrypt$a$b"])(
    "rejects the malformed hash %j",
    async (hash) => {
      await expect(verifyDeleteKey("open sesame", hash)).resolves.toBe(false);
    }
  );
});
