import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightCf, highlightCode, escapeHtml } from "../assets/js/highlight.js";

test("HTML is escaped inside strings and comments", () => {
  const html = highlightCf('// <script>alert("x")</script>\nstring s = "<img src=x>";');
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;img"));
});

test("untrusted code never produces raw markup", () => {
  const html = highlightCf('<b onclick="x">&amp;</b>');
  assert.ok(!/<[a-z]/i.test(html.replace(/<\/?span[^>]*>/g, "")));
});

test("AI_ASSIST gets its own accent class", () => {
  const html = highlightCf("AI_ASSIST { do the thing }");
  assert.ok(html.includes('class="tk-ai"'));
});

test("keywords, types, comments, directives are tokenized", () => {
  const html = highlightCf('#import math\nfn int f() { // note\n return 0; }');
  assert.ok(html.includes('tk-dir'));
  assert.ok(html.includes('tk-kw'));
  assert.ok(html.includes('tk-type'));
  assert.ok(html.includes('tk-com'));
});

test("generic highlighter escapes and picks hash comments for python", () => {
  const html = highlightCode('x = 1  # <b>hi</b>', "python");
  assert.ok(html.includes("&lt;b&gt;"));
  assert.ok(html.includes("tk-com"));
});

test("escapeHtml escapes & < > \"", () => {
  assert.equal(escapeHtml('<a href="x">&y</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;y&lt;/a&gt;');
});
