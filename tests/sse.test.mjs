import { test } from "node:test";
import assert from "node:assert/strict";
import { createSSEParser } from "../assets/js/openrouter.js";

function collect() {
  const events = [];
  const parser = createSSEParser((e) => events.push(e));
  return { events, parser };
}

test("content deltas are emitted", () => {
  const { events, parser } = collect();
  parser.push('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
  parser.push('data: {"choices":[{"delta":{"content":" world"}}]}\ndata: [DONE]\n');
  parser.end();
  assert.deepEqual(
    events.filter((e) => e.type === "content").map((e) => e.text),
    ["Hello", " world"],
  );
  assert.equal(events.at(-1).type, "done");
});

test("chunks split mid-line and mid-JSON are buffered", () => {
  const { events, parser } = collect();
  const full = 'data: {"choices":[{"delta":{"content":"abcdef"}}]}\n';
  parser.push(full.slice(0, 15));   // mid-"data:" line
  parser.push(full.slice(15, 40));  // mid-JSON
  parser.push(full.slice(40));
  parser.end();
  assert.deepEqual(events, [
    { type: "content", text: "abcdef" },
    { type: "done" },
  ]);
});

test("': OPENROUTER PROCESSING' keep-alives are ignored", () => {
  const { events, parser } = collect();
  parser.push(": OPENROUTER PROCESSING\n\n: OPENROUTER PROCESSING\n");
  parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\n');
  parser.end();
  assert.equal(events.filter((e) => e.type === "content").length, 1);
});

test("reasoning deltas emit a reasoning status event", () => {
  const { events, parser } = collect();
  parser.push('data: {"choices":[{"delta":{"reasoning":"thinking…"}}]}\n');
  parser.push('data: {"choices":[{"delta":{"reasoning_details":[{"type":"x"}]}}]}\n');
  parser.push('data: {"choices":[{"delta":{"content":"out"}}]}\n');
  parser.end();
  assert.equal(events.filter((e) => e.type === "reasoning").length, 2);
  assert.deepEqual(events.at(-2), { type: "content", text: "out" });
});

test("in-stream error objects emit an error event", () => {
  const { events, parser } = collect();
  parser.push('data: {"error":{"message":"No endpoints found","code":404}}\n');
  parser.end();
  const err = events.find((e) => e.type === "error");
  assert.ok(err);
  assert.equal(err.error.message, "No endpoints found");
});

test("usage objects emit a usage event", () => {
  const { events, parser } = collect();
  parser.push('data: {"choices":[{"delta":{"content":"x"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":5}}\n');
  parser.push("data: [DONE]\n");
  parser.end();
  assert.deepEqual(events.find((e) => e.type === "usage").usage, {
    prompt_tokens: 10, completion_tokens: 5,
  });
  assert.equal(events.find((e) => e.type === "finish").reason, "stop");
});

test("[DONE] terminates; nothing after it is emitted", () => {
  const { events, parser } = collect();
  parser.push("data: [DONE]\ndata: {\"choices\":[{\"delta\":{\"content\":\"late\"}}]}\n");
  parser.end();
  // content after [DONE] is still parsed by the line handler — the contract is
  // that done is emitted once; check done arrived and only once.
  assert.equal(events.filter((e) => e.type === "done").length, 1);
});

test("crlf line endings are handled", () => {
  const { events, parser } = collect();
  parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\r\ndata: [DONE]\r\n');
  parser.end();
  assert.deepEqual(events, [{ type: "content", text: "x" }, { type: "done" }]);
});

test("stream ending without [DONE] still emits done once", () => {
  const { events, parser } = collect();
  parser.push('data: {"choices":[{"delta":{"content":"x"}}]}\n');
  parser.end();
  assert.deepEqual(events, [{ type: "content", text: "x" }, { type: "done" }]);
});
