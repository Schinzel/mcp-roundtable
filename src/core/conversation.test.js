import { describe, expect, test } from "bun:test";
import { keyHash } from "./conversation.js";

describe("keyHash", () => {
  test("ger SHA-256 i hex", async () => {
    expect(await keyHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("olika nycklar ger olika hash", async () => {
    expect(await keyHash("sk-or-v1-a")).not.toBe(await keyHash("sk-or-v1-b"));
  });
});
