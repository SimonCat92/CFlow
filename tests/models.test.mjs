import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { mergeModels, MIN_CONTEXT } from "../assets/js/openrouter.js";

const dir = fileURLToPath(new URL("./fixtures/", import.meta.url));
const zdrData = JSON.parse(await readFile(dir + "zdr.json", "utf8"));
const modelsData = JSON.parse(await readFile(dir + "models.json", "utf8"));

test("MIN_CONTEXT is 32000", () => {
  assert.equal(MIN_CONTEXT, 32000);
});

test("merges ZDR endpoints with model metadata", () => {
  const merged = mergeModels(zdrData, modelsData);
  const ids = merged.map((m) => m.id);
  assert.ok(ids.includes("meta-llama/llama-3.3-70b-instruct"));
  assert.ok(ids.includes("openai/gpt-oss-20b"));
});

test("context is the max over endpoints, price the min, providers listed", () => {
  const merged = mergeModels(zdrData, modelsData);
  const llama = merged.find((m) => m.id === "meta-llama/llama-3.3-70b-instruct");
  // Fixture has CoreWeave (128000 ctx, 0.00000071) + AkashML (131072, 0.0000002).
  assert.equal(llama.contextLength, 131072);
  assert.equal(llama.promptPrice, 0.0000002);
  assert.equal(llama.completionPrice, 0.00000052);
  assert.deepEqual(llama.providers, ["AkashML", "CoreWeave"]);
});

test("models below MIN_CONTEXT are filtered out", () => {
  const merged = mergeModels(zdrData, modelsData);
  // baai/bge-m3 has context 8194 in the fixture.
  assert.ok(!merged.some((m) => m.id === "baai/bge-m3"));
});

test("non-text-output models are filtered out when /models is available", () => {
  const merged = mergeModels(zdrData, modelsData);
  // test/embedding-model has output_modalities ["embeddings"] and a 100k ctx.
  assert.ok(!merged.some((m) => m.id === "test/embedding-model"));
});

test("when /models is unavailable the modality filter is skipped", () => {
  const merged = mergeModels(zdrData, null);
  const ids = merged.map((m) => m.id);
  assert.ok(ids.includes("test/embedding-model"));   // kept: no modality data
  assert.ok(!ids.includes("baai/bge-m3"));           // still cut by context
});

test("negative or non-finite prices are treated as unknown", () => {
  const zdr = {
    data: [
      { model_id: "a/x", model_name: "A", context_length: 40000, provider_name: "P1", pricing: { prompt: "-1", completion: "-1" } },
      { model_id: "a/x", model_name: "A", context_length: 40000, provider_name: "P2", pricing: { prompt: "0.0000005", completion: "abc" } },
      { model_id: "b/y", model_name: "B", context_length: 40000, provider_name: "P3", pricing: { prompt: "-1", completion: "-1" } },
    ],
  };
  const merged = mergeModels(zdr, null);
  const a = merged.find((m) => m.id === "a/x");
  assert.equal(a.promptPrice, 0.0000005);   // -1 ignored, valid min kept
  assert.equal(a.completionPrice, null);    // "abc" and -1 -> unknown
  const b = merged.find((m) => m.id === "b/y");
  assert.equal(b.promptPrice, null);
  assert.equal(b.completionPrice, null);
});

test("results are sorted by model name", () => {
  const merged = mergeModels(zdrData, modelsData);
  const names = merged.map((m) => m.name);
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  assert.deepEqual(names, sorted);
});

test("empty or malformed input returns []", () => {
  assert.deepEqual(mergeModels(null, null), []);
  assert.deepEqual(mergeModels({}, modelsData), []);
  assert.deepEqual(mergeModels({ data: "nope" }, modelsData), []);
});
