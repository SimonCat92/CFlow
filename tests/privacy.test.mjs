// Static audit: the site's privacy claims are enforced here.
// Scans every .html/.js/.css file (except tests/ and assets/vendor/) for
// forbidden storage/tracking APIs and non-allowlisted remote URLs, and checks
// that each HTML page carries the Content-Security-Policy meta tag.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXCLUDED_DIRS = new Set([".git", "tests", join("assets", "vendor")]);
const SCAN_EXT = new Set([".html", ".js", ".css"]);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !EXCLUDED_DIRS.has(rel)) yield* walk(path);
    } else if (SCAN_EXT.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
      yield rel;
    }
  }
}

const files = [];
for await (const f of walk(ROOT)) files.push(f);
files.sort();

const contents = new Map();
for (const f of files) contents.set(f, await readFile(join(ROOT, f), "utf8"));

const FORBIDDEN = [
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "IndexedDB",
  "document.cookie",
  "serviceWorker",
  "navigator.sendBeacon",
  "caches.",
  "eval(",
  "new Function",
];

const ALLOWED_HOSTS = new Set([
  "openrouter.ai",
  "github.com",
  "simoncat92.github.io",
  "docs.github.com",
  "creativecommons.org",
]);

test("audit covers html, js and css files", () => {
  const exts = new Set(files.map((f) => f.slice(f.lastIndexOf("."))));
  for (const e of [".html", ".js", ".css"]) assert.ok(exts.has(e), `no ${e} files scanned`);
});

test("no storage, cookies, tracking or code-eval APIs", () => {
  for (const [f, text] of contents) {
    for (const token of FORBIDDEN) {
      assert.ok(!text.includes(token), `${f} contains forbidden token ${token}`);
    }
  }
});

test("only allowlisted remote origins are referenced", () => {
  const urlRe = /https?:\/\/[^\s"'`)\]<>,;]+/g;
  for (const [f, text] of contents) {
    for (const m of text.matchAll(urlRe)) {
      let host;
      try { host = new URL(m[0]).hostname; } catch { assert.fail(`${f}: bad URL ${m[0]}`); }
      const bare = host.replace(/^www\./, "");
      assert.ok(ALLOWED_HOSTS.has(bare), `${f}: disallowed host ${host} (${m[0]})`);
    }
  }
});

const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https://openrouter.ai; base-uri 'none'; form-action 'none'";

test("every html page has the CSP meta tag", () => {
  const htmlFiles = files.filter((f) => f.endsWith(".html"));
  assert.ok(htmlFiles.length >= 4, "expected at least 4 html pages");
  for (const f of htmlFiles) {
    const text = contents.get(f);
    assert.ok(
      text.includes(`http-equiv="Content-Security-Policy" content="${CSP}"`),
      `${f} missing exact CSP meta`,
    );
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(text), `${f} has an inline <script>`);
  }
});

test("the API base is a hardcoded constant, not configurable", () => {
  const or = contents.get(join("assets", "js", "openrouter.js"));
  assert.ok(or.includes('export const API_BASE = "https://openrouter.ai/api/v1"'));
  assert.ok(!or.includes("URLSearchParams"), "API base must not come from query params");
});

test("openrouter fetches omit credentials and bypass caches", () => {
  const or = contents.get(join("assets", "js", "openrouter.js"));
  assert.match(or, /credentials:\s*"omit"/);
  assert.match(or, /cache:\s*"no-store"/);
});

test("the [hidden] attribute hides elements globally", () => {
  const css = contents.get(join("assets", "css", "style.css"));
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/, "style.css must hide [hidden] elements globally");
});

test("scrollbar-color only appears inside the Firefox @supports fallback", () => {
  const css = contents.get(join("assets", "css", "style.css"));
  // Chromium >=121 ignores ::-webkit-scrollbar rules on any element that has
  // scrollbar-color/scrollbar-width, and scrollbar-color inherits: it must
  // only exist inside `@supports not selector(::-webkit-scrollbar)`.
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@supports\s+not\s+selector\(::-webkit-scrollbar\)\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  assert.ok(!stripped.includes("scrollbar-color"), "scrollbar-color found outside the @supports fallback");
  assert.ok(!stripped.includes("scrollbar-width"), "scrollbar-width found outside the @supports fallback");
});

test("the visual language uses only zero border-radius", () => {
  const css = contents.get(join("assets", "css", "style.css"));
  for (const m of css.matchAll(/border-radius[^:]*:\s*([^;]+);/g)) {
    assert.ok(
      m[1].trim().split(/\s+/).every((v) => v === "0" || v === "0px" || v.startsWith("0 ")),
      `non-zero border-radius: ${m[0]}`,
    );
  }
});

const COPY_EXT = new Set([".html", ".js", ".css", ".md", ".cf"]);

test("no em-dashes in copy, code or comments", async () => {
  async function* walkAll(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(ROOT, path);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name) && !EXCLUDED_DIRS.has(rel)) yield* walkAll(path);
      } else if (COPY_EXT.has(entry.name.slice(entry.name.lastIndexOf("."))) && entry.name !== "LICENSE") {
        yield rel;
      }
    }
  }
  for await (const f of walkAll(ROOT)) {
    const text = contents.get(f) ?? (await readFile(join(ROOT, f), "utf8"));
    assert.ok(!text.includes("—"), `${f} contains an em-dash`);
  }
});
