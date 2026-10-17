import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResponse } from "../assets/js/parse.js";

test("single file with FILE heading", () => {
  const text = `PLAN:
- map struct to dataclass
- use stdlib only

### FILE: src/main.py
\`\`\`python
print("hi")
\`\`\`

NOTES:
- none
`;
  const r = parseResponse(text);
  assert.equal(r.files.length, 1);
  assert.equal(r.files[0].name, "src/main.py");
  assert.equal(r.files[0].lang, "python");
  assert.equal(r.files[0].code, 'print("hi")');
  assert.ok(r.plan.includes("map struct to dataclass"));
  assert.ok(r.notes.includes("- none"));
  assert.equal(r.truncated, false);
});

test("no FILE heading falls back to main.<ext> from fence info", () => {
  const text = `PLAN:
- go

\`\`\`rust
fn main() {}
\`\`\`
`;
  const r = parseResponse(text);
  assert.equal(r.files[0].name, "main.rs");
});

test("no FILE heading and unknown info falls back to chosen defaultExt", () => {
  const r = parseResponse("```\ncode\n```\n", { defaultExt: "kt" });
  assert.equal(r.files[0].name, "main.kt");
});

test("two files keep order", () => {
  const text = `PLAN:
- x

### FILE: a.py
\`\`\`python
a = 1
\`\`\`

### FILE: b.py
\`\`\`python
b = 2
\`\`\`
`;
  const r = parseResponse(text);
  assert.deepEqual(r.files.map((f) => f.name), ["a.py", "b.py"]);
  assert.equal(r.files[0].code, "a = 1");
  assert.equal(r.files[1].code, "b = 2");
});

test("duplicate default names are deduped", () => {
  const text = "```python\nx=1\n```\n\n```python\ny=2\n```\n";
  const r = parseResponse(text);
  assert.deepEqual(r.files.map((f) => f.name), ["main.py", "main_2.py"]);
});

test("4-backtick fence can contain triple backticks", () => {
  const text = `PLAN:
- doc file

### FILE: docs/example.md
\`\`\`\`markdown
# Title
\`\`\`python
nested()
\`\`\`
\`\`\`\`
`;
  const r = parseResponse(text);
  assert.equal(r.files.length, 1);
  assert.equal(r.files[0].name, "docs/example.md");
  assert.ok(r.files[0].code.includes("```python"));
  assert.ok(r.files[0].code.includes("nested()"));
  assert.equal(r.truncated, false);
});

test("unterminated fence keeps content and flags truncated", () => {
  const text = `PLAN:
- x

### FILE: main.py
\`\`\`python
print("never closed")
`;
  const r = parseResponse(text);
  assert.equal(r.truncated, true);
  assert.equal(r.files.length, 1);
  assert.ok(r.files[0].code.includes("never closed"));
});

test("missing PLAN/NOTES labels is tolerated", () => {
  const text = `I will transpile this.

\`\`\`python
x = 1
\`\`\`

Run it with python main.py`;
  const r = parseResponse(text);
  assert.ok(r.plan.includes("I will transpile this."));
  assert.ok(r.notes.includes("python main.py"));
  assert.equal(r.files.length, 1);
});

test("FILE heading tolerates backticks around path", () => {
  const text = "### FILE: `src/app.py`\n```python\nx=1\n```\n";
  const r = parseResponse(text);
  assert.equal(r.files[0].name, "src/app.py");
});

test("prose between fences does not leak into code or notes", () => {
  const text = `PLAN:
- x

### FILE: a.py
\`\`\`python
a = 1
\`\`\`
some filler text
### FILE: b.py
\`\`\`python
b = 2
\`\`\`
NOTES:
- done`;
  const r = parseResponse(text);
  assert.equal(r.files.length, 2);
  assert.equal(r.notes, "- done");
});

test("PLAN label absent but pre-fence text becomes plan", () => {
  const r = parseResponse("some preamble\n```js\nx\n```");
  assert.equal(r.plan, "some preamble");
});

test("fenced MODULE MAP inside PLAN stays prose, only FILE fences are files", () => {
  const text = `PLAN:
- approach

\`\`\`
// MODULE MAP
// core: logic -> math
\`\`\`

### FILE: main.py
\`\`\`python
x = 1
\`\`\`
`;
  const r = parseResponse(text);
  assert.equal(r.files.length, 1);
  assert.equal(r.files[0].name, "main.py");
  assert.ok(r.plan.includes("MODULE MAP"));
  assert.ok(r.plan.includes("core: logic -> math"));
});

test("a bash fence inside NOTES stays prose, not a file", () => {
  const text = `PLAN:
- x

### FILE: main.py
\`\`\`python
x = 1
\`\`\`

NOTES:
- install deps:
\`\`\`bash
pip install x
\`\`\`
`;
  const r = parseResponse(text);
  assert.equal(r.files.length, 1);
  assert.ok(r.notes.includes("pip install x"));
});

test("prose fence between two file fences is ignored", () => {
  const text = `PLAN:
- x

### FILE: a.py
\`\`\`python
a = 1
\`\`\`
\`\`\`text
not a file
\`\`\`
### FILE: b.py
\`\`\`python
b = 2
\`\`\`
`;
  const r = parseResponse(text);
  assert.deepEqual(r.files.map((f) => f.name), ["a.py", "b.py"]);
});

test("unterminated prose fence still flags truncation", () => {
  const text = `PLAN:
\`\`\`
MODULE MAP never closes
### FILE: main.py
\`\`\`python
x = 1
`;
  // The unterminated first fence swallows everything below it (including the
  // FILE heading), so fallback mode applies and it becomes the only file.
  const r = parseResponse(text);
  assert.equal(r.truncated, true);
  assert.equal(r.files.length, 1);
  assert.ok(r.files[0].code.includes("MODULE MAP never closes"));
});
