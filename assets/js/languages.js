// Target languages offered by the playground, plus the file extension used
// when downloading generated code. "other" reveals a free-text input.

export const TARGET_LANGUAGES = [
  { id: "python",     label: "Python",               ext: "py" },
  { id: "typescript", label: "TypeScript",           ext: "ts" },
  { id: "javascript", label: "JavaScript (Node.js)", ext: "js" },
  { id: "rust",       label: "Rust",                 ext: "rs" },
  { id: "go",         label: "Go",                   ext: "go" },
  { id: "c",          label: "C",                    ext: "c"    },
  { id: "cpp",        label: "C++",                  ext: "cpp" },
  { id: "csharp",     label: "C#",                   ext: "cs" },
  { id: "java",       label: "Java",                 ext: "java" },
  { id: "kotlin",     label: "Kotlin",               ext: "kt" },
  { id: "swift",      label: "Swift",                ext: "swift" },
  { id: "php",        label: "PHP",                  ext: "php" },
  { id: "ruby",       label: "Ruby",                 ext: "rb" },
  { id: "dart",       label: "Dart",                 ext: "dart" },
  { id: "zig",        label: "Zig",                  ext: "zig" },
  { id: "lua",        label: "Lua",                  ext: "lua" },
  { id: "bash",       label: "Bash",                 ext: "sh" },
  { id: "other",      label: "Other\u2026",          ext: "txt" },
];

// Fence info-string -> extension, used when the model omits a FILE heading.
const INFO_TO_EXT = {
  python: "py", py: "py",
  typescript: "ts", ts: "ts",
  javascript: "js", js: "js", node: "js",
  rust: "rs", rs: "rs",
  go: "go", golang: "go",
  c: "c", h: "h",
  cpp: "cpp", "c++": "cpp", cxx: "cpp",
  csharp: "cs", "c#": "cs", cs: "cs",
  java: "java",
  kotlin: "kt", kt: "kt",
  swift: "swift",
  php: "php",
  ruby: "rb", rb: "rb",
  dart: "dart",
  zig: "zig",
  lua: "lua",
  bash: "sh", sh: "sh", shell: "sh", zsh: "sh",
  html: "html", css: "css", json: "json", yaml: "yaml", yml: "yml",
  toml: "toml", xml: "xml", sql: "sql", markdown: "md", md: "md",
  text: "txt", txt: "txt",
};

export function languageById(id) {
  return TARGET_LANGUAGES.find((l) => l.id === id) || null;
}

// The label sent to the model: the fixed label, or the user's free text.
export function languageLabel(id, otherText = "") {
  if (id === "other") return String(otherText || "").trim();
  return languageById(id)?.label || "";
}

// Download extension for a target language id ("other" -> txt).
export function extensionFor(id) {
  return languageById(id)?.ext || "txt";
}

// Extension for a code-fence info string, e.g. "python" -> "py".
export function extFromInfoString(info) {
  const key = String(info || "").trim().toLowerCase().split(/\s+/)[0];
  return INFO_TO_EXT[key] || "";
}
