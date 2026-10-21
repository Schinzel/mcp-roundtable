import { describe, expect, test } from "bun:test";
import { filterModels, modelsUrl, trimCatalog } from "./models.js";

const model = (id, name, created = 1792225624) => ({ id, name, context_length: 1000, created });

describe("modelsUrl", () => {
  test("filters on company and age at OpenRouter", () => {
    const url = new URL(modelsUrl());
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/api/v1/models");
    expect(url.searchParams.get("model_authors")).toBe("openai,google,anthropic,x-ai,deepseek");
    expect(url.searchParams.get("max_age_days")).toBe("365");
    expect(url.searchParams.get("sort")).toBe("newest");
  });
});

describe("trimCatalog", () => {
  const catalog = {
    data: [
      model("openai/gpt-6.1-sol", "OpenAI: GPT-6.1 Sol"),
      model("openai/gpt-6.1-sol:batch", "OpenAI: GPT-6.1 Sol (batch)"),
      model("~openai/gpt-latest", "OpenAI: GPT Latest"),
      model("google/gemini-4-argon", "Google: Gemini 4 Argon"),
    ],
  };

  test("removes variants and aliases", () => {
    expect(trimCatalog(catalog).map((m) => m.slug)).toEqual(["openai/gpt-6.1-sol", "google/gemini-4-argon"]);
  });

  test("returns slug, name, context window and date", () => {
    expect(trimCatalog(catalog)[0]).toEqual({
      slug: "openai/gpt-6.1-sol",
      name: "OpenAI: GPT-6.1 Sol",
      context_length: 1000,
      added: "2026-10-17",
    });
  });

  test("includes the model's thinking levels and default level", () => {
    const reasoning = { supported_efforts: ["high", "medium", "low"], default_effort: "medium" };
    const [m] = trimCatalog({ data: [{ ...model("google/gemini-3.8-flash", "Gemini"), reasoning }] });
    expect(m.thinking).toEqual(["high", "medium", "low"]);
    expect(m.default_thinking).toBe("medium");
  });

  test("a model without levels gets no thinking fields", () => {
    const [m] = trimCatalog({ data: [{ ...model("anthropic/claude-opus-4.5", "Opus"), reasoning: { supported_efforts: [] } }] });
    expect(m).not.toHaveProperty("thinking");
    expect(m).not.toHaveProperty("default_thinking");
  });
});

describe("filterModels", () => {
  const models = [
    { slug: "openai/gpt-6.1-sol", name: "OpenAI: GPT-6.1 Sol" },
    { slug: "google/gemini-4-argon", name: "Google: Gemini 4 Argon" },
  ];

  test("filters on slug and name, case-insensitive", () => {
    expect(filterModels(models, "GEMINI").map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
    expect(filterModels(models, "argon").map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
  });

  test("an empty filter gives all", () => {
    expect(filterModels(models, "  ")).toHaveLength(2);
    expect(filterModels(models)).toHaveLength(2);
  });
});
