import { describe, expect, test } from "bun:test";
import { modelsUrl, toModelList } from "./models.js";

const model = (id, name, created = 1792225624) => ({ id, name, context_length: 1000, created });

describe("modelsUrl", () => {
  test("filtrerar på företag och ålder hos OpenRouter", () => {
    const url = new URL(modelsUrl());
    expect(url.origin + url.pathname).toBe("https://openrouter.ai/api/v1/models");
    expect(url.searchParams.get("model_authors")).toBe("openai,google,anthropic,x-ai,deepseek");
    expect(url.searchParams.get("max_age_days")).toBe("365");
    expect(url.searchParams.get("sort")).toBe("newest");
  });
});

describe("toModelList", () => {
  const catalog = {
    data: [
      model("openai/gpt-6.1-sol", "OpenAI: GPT-6.1 Sol"),
      model("openai/gpt-6.1-sol:batch", "OpenAI: GPT-6.1 Sol (batch)"),
      model("~openai/gpt-latest", "OpenAI: GPT Latest"),
      model("google/gemini-4-argon", "Google: Gemini 4 Argon"),
    ],
  };

  test("tar bort varianter och alias", () => {
    expect(toModelList(catalog).map((m) => m.slug)).toEqual(["openai/gpt-6.1-sol", "google/gemini-4-argon"]);
  });

  test("returnerar slug, namn, kontextfönster och datum", () => {
    expect(toModelList(catalog)[0]).toEqual({
      slug: "openai/gpt-6.1-sol",
      name: "OpenAI: GPT-6.1 Sol",
      context_length: 1000,
      added: "2026-10-17",
    });
  });

  test("filtrerar på slug och namn utan hänsyn till skiftläge", () => {
    expect(toModelList(catalog, "GEMINI").map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
    expect(toModelList(catalog, "argon").map((m) => m.slug)).toEqual(["google/gemini-4-argon"]);
    expect(toModelList(catalog, "  ")).toHaveLength(2);
  });
});
