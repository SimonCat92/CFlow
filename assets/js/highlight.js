// Syntax highlighting. Everything here is escape-first: source text is only
// ever HTML-escaped and wrapped in <span> tokens, so highlighted output is
// always safe to assign to innerHTML.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Order matters: the first alternative that matches at the leftmost position
// wins, so comments and strings swallow anything that looks like a keyword.
const CF_MASTER = new RegExp(
  [
    String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
    String.raw`(?<str>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')`,
    String.raw`(?<dir>#[A-Za-z_]\w*)`,
    String.raw`(?<ai>\bAI_ASSIST\b)`,
    String.raw`(?<todo>\bTODO\b)`,
    String.raw`(?<kw>\b(?:fn|class|struct|enum|const|if|else|for|while|do|in|return|new|null|true|false|switch|case|default|break|continue|import)\b)`,
    String.raw`(?<type>\b(?:int|float|double|string|bool|void|char|dict|map|list|vector|set|any|datetime|auto)\b)`,
    String.raw`(?<num>\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<op>->|\*)`,
  ].join("|"),
  "g",
);

// Minimal generic tokenizer for transpiled output: comments, strings, numbers.
// Line-comment style is picked per language; // and /* */ work for most.
const HASH_COMMENT_LANGS = new Set([
  "py", "python", "sh", "bash", "shell", "zsh", "rb", "ruby", "yaml", "yml",
  "toml", "pl", "r", "makefile",
]);

const FENCE_ONLY_COMMENT_LANGS = new Set(["html", "xml", "css", "json", "md"]);

function genericMaster(lang) {
  const l = String(lang || "").toLowerCase();
  const parts = [
    String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))`,
    String.raw`(?<str>"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`" + ")",
    String.raw`(?<num>\b\d+(?:\.\d+)?\b)`,
  ];
  if (HASH_COMMENT_LANGS.has(l)) {
    parts.unshift(String.raw`(?<hcom>#[^\n]*)`);
  } else if (!FENCE_ONLY_COMMENT_LANGS.has(l)) {
    // Unknown language: still mark full-line # comments (shebangs, #include).
    parts.unshift(String.raw`(?<hcom>^#[^\n]*)`);
  }
  return new RegExp(parts.join("|"), "gm");
}

function tokenize(src, master) {
  let html = "";
  let last = 0;
  for (const m of src.matchAll(master)) {
    if (m.index > last) html += escapeHtml(src.slice(last, m.index));
    const cls = Object.keys(m.groups).find((k) => m.groups[k] !== undefined);
    html += `<span class="tk-${cls === "hcom" ? "com" : cls}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  html += escapeHtml(src.slice(last));
  return html;
}

export function highlightCf(src) {
  return tokenize(String(src ?? ""), CF_MASTER);
}

export function highlightCode(src, lang = "") {
  return tokenize(String(src ?? ""), genericMaster(lang));
}
