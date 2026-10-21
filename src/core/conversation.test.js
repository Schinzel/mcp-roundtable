import { describe, expect, test } from "bun:test";
import { keyHash } from "./conversation.js";

describe("keyHash", () => {
  test("gives SHA-256 in hex", async () => {
    expect(await keyHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("different keys give different hashes", async () => {
    expect(await keyHash("sk-or-v1-a")).not.toBe(await keyHash("sk-or-v1-b"));
  });
});
