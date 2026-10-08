// Playground wiring for index.html.
// The API key lives only in the `apiKey` variable below and the password
// input the user typed it into. It leaves the page once, as the
// Authorization header on the request to openrouter.ai.

import { buildMessages } from "./prompt.js";
import { parseResponse } from "./parse.js";
import { highlightCf, highlightCode } from "./highlight.js";
import { TARGET_LANGUAGES, languageLabel, extensionFor } from "./languages.js";
import { fetchModels, mergeModels, streamChat, MIN_CONTEXT } from "./openrouter.js";
import { initNotice } from "./notice.js";

const MAX_FILE_BYTES = 256 * 1024;

const $ = (id) => document.getElementById(id);

// ---- state ---------------------------------------------------------------
let apiKey = "";
let fileName = "program.cf";
let rulesText = null;            // cached in memory after first fetch
let models = [];                 // merged ZDR model list
let selectedModelId = null;
let activeOptionIdx = -1;
let aborter = null;
let streamingText = "";
let elapsedTimer = null;

// ---- elements ------------------------------------------------------------
const keyInput = $("api-key");
const keyWarning = $("key-warning");
const clearKeyBtn = $("clear-key");
const editor = $("editor");
const editorCode = $("editor-highlight-code");
const editorPre = $("editor-highlight");
const lineCount = $("line-count");
const fileNameEl = $("file-name");
const uploadInput = $("upload-input");
const langSelect = $("lang-select");
const langOther = $("lang-other");
const modelCombo = $("model-combo");
const modelDrop = $("model-drop");
const modelList = $("model-list");
const modelCount = $("model-count");
const modelStatus = $("model-status");
const modelRetry = $("model-retry");
const modelSelected = $("model-selected");
const compileBtn = $("compile-btn");
const stopBtn = $("stop-btn");
const statusEl = $("status");
const outputRaw = $("output-raw");
const resultEl = $("result");
const resultTabs = $("result-tabs");
const resultPanels = $("result-panels");
const warningsEl = $("out-warnings");

// ---- helpers -------------------------------------------------------------
function setStatus(text) { statusEl.textContent = text; }

function updateCompileBtn() {
  const lang = languageLabel(langSelect.value, langOther.value);
  compileBtn.disabled = !(
    apiKey &&
    editor.value.trim() &&
    lang &&
    selectedModelId &&
    !aborter
  );
}

function fmtPerM(perToken) {
  return perToken == null ? "n/a" : `$${(perToken * 1e6).toFixed(2)}`;
}

function fmtCtx(n) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

// ---- API key ---------------------------------------------------------------
keyInput.addEventListener("input", () => {
  apiKey = keyInput.value;
  keyWarning.hidden = !apiKey || /^sk-or-/.test(apiKey);
  updateCompileBtn();
});

clearKeyBtn.addEventListener("click", () => {
  apiKey = "";
  keyInput.value = "";
  keyWarning.hidden = true;
  keyInput.focus();
  updateCompileBtn();
});

// ---- editor ----------------------------------------------------------------
function syncEditor() {
  let html = highlightCf(editor.value);
  if (editor.value.endsWith("\n") || editor.value === "") html += "\n";
  editorCode.innerHTML = html;
  const n = editor.value ? editor.value.split("\n").length : 1;
  lineCount.textContent = `${n} line${n === 1 ? "" : "s"}`;
  editorPre.scrollTop = editor.scrollTop;
  editorPre.scrollLeft = editor.scrollLeft;
  updateCompileBtn();
}

editor.addEventListener("input", syncEditor);
editor.addEventListener("scroll", () => {
  editorPre.scrollTop = editor.scrollTop;
  editorPre.scrollLeft = editor.scrollLeft;
});
editor.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    editor.setRangeText("    ", editor.selectionStart, editor.selectionEnd, "end");
    syncEditor();
  }
});

function setProgram(text, name) {
  editor.value = text;
  if (name) fileName = name;
  fileNameEl.textContent = fileName;
  syncEditor();
}

function loadFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setStatus(`"${file.name}" is too large (max ${MAX_FILE_BYTES / 1024} KB).`);
    return;
  }
  file.text().then((t) => setProgram(t, file.name), () => setStatus(`Could not read "${file.name}".`));
}

$("upload-btn").addEventListener("click", () => uploadInput.click());
uploadInput.addEventListener("change", () => {
  loadFile(uploadInput.files?.[0]);
  uploadInput.value = "";
});

const editorWrap = $("editor-wrap");
["dragenter", "dragover"].forEach((ev) =>
  editorWrap.addEventListener(ev, (e) => {
    e.preventDefault();
    editorWrap.classList.add("dragging");
  }));
["dragleave", "drop"].forEach((ev) =>
  editorWrap.addEventListener(ev, (e) => {
    e.preventDefault();
    editorWrap.classList.remove("dragging");
  }));
editorWrap.addEventListener("drop", (e) => loadFile(e.dataTransfer?.files?.[0]));

$("example-btn").addEventListener("click", async () => {
  setStatus("Loading example_program.cf…");
  try {
    const res = await fetch("./example_program.cf", { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setProgram(await res.text(), "example_program.cf");
    setStatus("Loaded example_program.cf.");
  } catch {
    setStatus("Could not load example_program.cf.");
  }
});

$("download-btn").addEventListener("click", () => {
  const blob = new Blob([editor.value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName || "program.cf";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

$("clear-btn").addEventListener("click", () => setProgram("", "program.cf"));

// ---- target language -------------------------------------------------------
for (const l of TARGET_LANGUAGES) {
  const opt = document.createElement("option");
  opt.value = l.id;
  opt.textContent = l.label;
  langSelect.appendChild(opt);
}
langSelect.value = "python";
langSelect.addEventListener("change", () => {
  langOther.hidden = langSelect.value !== "other";
  if (!langOther.hidden) langOther.focus();
  updateCompileBtn();
});
langOther.addEventListener("input", updateCompileBtn);

// ---- model combobox ----------------------------------------------------------
// The dropdown is a direct child of <body> and uses position:fixed so it can
// overlay other panels without being clipped by their cut corners.
let modelsLoaded = false;
let modelsLoading = false;
let comboFilter = "";          // text typed since the last selection

function setModelMessage(text, showRetry) {
  modelStatus.textContent = text || "";
  modelStatus.hidden = !text;
  modelRetry.hidden = !showRetry;
}

async function loadModels() {
  if (modelsLoading) return;
  modelsLoading = true;
  modelList.innerHTML = "";
  modelCount.textContent = "";
  setModelMessage("Loading zero-data-retention models…", false);
  try {
    const { zdrData, modelsData } = await fetchModels();
    models = mergeModels(zdrData, modelsData);
    modelsLoaded = true;
    setModelMessage(
      modelsData == null ? "Model metadata is unavailable, so the list shows all ZDR-capable models." : "",
      false,
    );
    modelCount.textContent = `· ${models.length} ZDR`;
    renderModelList();
  } catch (err) {
    setModelMessage(err.message || "Could not load models.", true);
  } finally {
    modelsLoading = false;
  }
}

function positionDrop() {
  const r = modelCombo.getBoundingClientRect();
  const w = Math.min(Math.max(r.width, 280), window.innerWidth - 16);
  modelDrop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  modelDrop.style.top = `${r.bottom + 4}px`;
  modelDrop.style.width = `${w}px`;
}

function openCombo() {
  if (!modelDrop.hidden) return;
  positionDrop();
  modelDrop.hidden = false;
  modelCombo.setAttribute("aria-expanded", "true");
  // Opening the picker is an explicit user action, so it may contact
  // openrouter.ai for the first time here.
  if (!modelsLoaded && !modelsLoading) loadModels();
}

function closeCombo() {
  modelDrop.hidden = true;
  modelCombo.setAttribute("aria-expanded", "false");
  modelCombo.removeAttribute("aria-activedescendant");
  activeOptionIdx = -1;
}

function filteredModels() {
  const q = comboFilter.trim().toLowerCase();
  if (!q) return models;
  return models.filter((m) =>
    m.name.toLowerCase().includes(q) ||
    m.id.toLowerCase().includes(q) ||
    m.providers.some((p) => p.toLowerCase().includes(q)));
}

function renderModelList() {
  const list = filteredModels();
  modelList.innerHTML = "";
  activeOptionIdx = -1;
  modelCombo.removeAttribute("aria-activedescendant");
  list.forEach((m, i) => {
    const li = document.createElement("li");
    li.id = `model-opt-${i}`;
    li.setAttribute("role", "option");
    li.dataset.id = m.id;
    li.className = "model-option";
    li.setAttribute("aria-selected", m.id === selectedModelId ? "true" : "false");

    const top = document.createElement("div");
    top.className = "model-option-top";
    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = m.name;
    const ctx = document.createElement("span");
    ctx.className = "model-ctx";
    ctx.textContent = `${fmtCtx(m.contextLength)} ctx`;
    top.append(name, ctx);

    const id = document.createElement("div");
    id.className = "model-id";
    id.textContent = m.id;

    const meta = document.createElement("div");
    meta.className = "model-meta";
    meta.textContent =
      `in ${fmtPerM(m.promptPrice)}/1M · out ${fmtPerM(m.completionPrice)}/1M` +
      ` · ${m.providers.slice(0, 3).join(", ")}${m.providers.length > 3 ? ` +${m.providers.length - 3}` : ""}`;

    li.append(top, id, meta);
    li.addEventListener("click", () => selectModel(m.id));
    modelList.appendChild(li);
  });
}

function selectModel(id) {
  selectedModelId = id;
  comboFilter = "";
  const m = models.find((x) => x.id === id);
  modelCombo.value = m ? m.name : "";
  modelSelected.textContent = m
    ? `${fmtCtx(m.contextLength)} ctx · in ${fmtPerM(m.promptPrice)} / out ${fmtPerM(m.completionPrice)} per 1M tokens`
    : "";
  for (const li of modelList.children) {
    li.setAttribute("aria-selected", li.dataset.id === id ? "true" : "false");
  }
  closeCombo();
  updateCompileBtn();
}

modelCombo.addEventListener("focus", openCombo);
modelCombo.addEventListener("click", openCombo);
modelCombo.addEventListener("input", () => {
  comboFilter = modelCombo.value;
  if (modelDrop.hidden) openCombo();
  renderModelList();
});
modelRetry.addEventListener("click", loadModels);

modelCombo.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!modelDrop.hidden) { e.preventDefault(); closeCombo(); }
    return;
  }
  if (modelDrop.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
    e.preventDefault();
    openCombo();
    return;
  }
  if (e.key === "Tab") { closeCombo(); return; }
  const list = filteredModels();
  if (!list.length) return;
  const move = (i) => {
    activeOptionIdx = Math.max(0, Math.min(list.length - 1, i));
    const id = `model-opt-${activeOptionIdx}`;
    modelCombo.setAttribute("aria-activedescendant", id);
    for (const el of modelList.children) el.classList.toggle("active", el.id === id);
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  };
  if (e.key === "ArrowDown") { e.preventDefault(); move(activeOptionIdx + 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); move(activeOptionIdx - 1); }
  else if (e.key === "Home") { e.preventDefault(); move(0); }
  else if (e.key === "End") { e.preventDefault(); move(list.length - 1); }
  else if (e.key === "Enter" && activeOptionIdx >= 0) {
    e.preventDefault();
    selectModel(list[activeOptionIdx].id);
  }
});

document.addEventListener("click", (e) => {
  if (modelDrop.hidden) return;
  const t = e.target;
  if (t === modelCombo || (t instanceof Element && t.closest("#model-drop"))) return;
  closeCombo();
});
window.addEventListener("scroll", (e) => {
  if (modelDrop.hidden) return;
  if (e.target instanceof Element && modelDrop.contains(e.target)) return;
  closeCombo();
}, true);
window.addEventListener("resize", () => { if (!modelDrop.hidden) positionDrop(); });

// ---- compile ---------------------------------------------------------------
function resetOutput() {
  streamingText = "";
  outputRaw.textContent = "";
  outputRaw.classList.remove("placeholder");
  resultEl.hidden = true;
  resultTabs.innerHTML = "";
  resultPanels.innerHTML = "";
  warningsEl.innerHTML = "";
}

function startElapsed() {
  const t0 = Date.now();
  elapsedTimer = setInterval(() => {
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    if (statusEl.dataset.phase) statusEl.textContent = `${statusEl.dataset.phase} (${s}s)`;
  }, 500);
  return t0;
}

function setPhase(p) {
  statusEl.dataset.phase = p;
  statusEl.textContent = p;
}

function stopElapsed() {
  clearInterval(elapsedTimer);
  elapsedTimer = null;
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => { btn.textContent = old; }, 1200);
}

function downloadText(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function addTab(label, build) {
  const btn = document.createElement("button");
  btn.className = "tab";
  btn.type = "button";
  btn.textContent = label;
  const panel = document.createElement("div");
  panel.className = "tab-panel";
  panel.hidden = true;
  build(panel);
  btn.addEventListener("click", () => {
    for (const b of resultTabs.children) b.classList.toggle("active", b === btn);
    for (const p of resultPanels.children) p.hidden = p !== panel;
  });
  resultTabs.appendChild(btn);
  resultPanels.appendChild(panel);
  return btn;
}

function renderResult(parsed, finishReason) {
  if (finishReason === "length" || parsed.truncated) {
    const w = document.createElement("p");
    w.className = "warning";
    w.textContent = "The output appears to be cut off. The model hit its token limit or stopped mid-file, so re-run it or split your program.";
    warningsEl.appendChild(w);
  }

  if (parsed.plan) {
    addTab("Plan", (p) => {
      const pre = document.createElement("pre");
      pre.className = "prose-block";
      pre.textContent = parsed.plan;
      p.appendChild(pre);
    });
  }

  const seen = new Set();
  for (const f of parsed.files) {
    let label = f.name.split("/").pop() || f.name;
    while (seen.has(label)) label = `(${label})`;
    seen.add(label);
    addTab(label, (p) => {
      const bar = document.createElement("div");
      bar.className = "file-bar";
      const fname = document.createElement("code");
      fname.textContent = f.name;
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn btn-small";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => copyText(f.code, copy));
      const dl = document.createElement("button");
      dl.type = "button";
      dl.className = "btn btn-small";
      dl.textContent = "Download";
      dl.addEventListener("click", () => downloadText(f.name.split("/").pop() || f.name, f.code));
      bar.append(fname, copy, dl);
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.innerHTML = highlightCode(f.code, f.lang);
      pre.appendChild(code);
      p.append(bar, pre);
    });
  }

  if (parsed.notes) {
    addTab("Notes", (p) => {
      const pre = document.createElement("pre");
      pre.className = "prose-block";
      pre.textContent = parsed.notes;
      p.appendChild(pre);
    });
  }

  addTab("Raw response", (p) => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = streamingText;
    pre.appendChild(code);
    p.appendChild(pre);
  });

  resultTabs.children[0]?.click();
  resultEl.hidden = false;
}

async function compile() {
  const lang = languageLabel(langSelect.value, langOther.value);
  aborter = new AbortController();
  updateCompileBtn();
  stopBtn.hidden = false;
  compileBtn.classList.add("running");
  compileBtn.querySelector(".btn-text").textContent = "Compiling\u2026";
  statusEl.classList.add("live");
  resetOutput();
  const t0 = startElapsed();
  let usage = null;
  let finishReason = null;
  let streamError = null;
  let sawContent = false;

  try {
    if (!rulesText) {
      setPhase("Loading rules.cf…");
      const res = await fetch("./rules.cf", { credentials: "omit", cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load rules.cf (HTTP ${res.status}).`);
      rulesText = await res.text();
    }
    const messages = buildMessages({
      rulesText,
      programText: editor.value,
      fileName,
      targetLanguage: lang,
    });

    setPhase("Waiting for provider…");
    await streamChat({
      apiKey,
      model: selectedModelId,
      messages,
      signal: aborter.signal,
      onEvent: (ev) => {
        if (ev.type === "reasoning" && !sawContent) setPhase("Model is reasoning…");
        else if (ev.type === "content") {
          if (!sawContent) { sawContent = true; setPhase("Writing code…"); }
          streamingText += ev.text;
          outputRaw.textContent = streamingText;
          outputRaw.scrollTop = outputRaw.scrollHeight;
        }
        else if (ev.type === "usage") usage = ev.usage;
        else if (ev.type === "finish") finishReason = ev.reason;
        else if (ev.type === "error") {
          streamError = ev.error?.message || JSON.stringify(ev.error);
        }
      },
    });

    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    setPhase("");
    if (streamError) {
      setStatus(`The provider reported an error: ${streamError}`);
    } else if (!streamingText.trim()) {
      setStatus(`The model returned no output (finish reason: ${finishReason ?? "unknown"}). Try again or choose another model.`);
    } else {
      let tail = "";
      if (usage) {
        const pt = usage.prompt_tokens ?? usage.promptTokens;
        const ct = usage.completion_tokens ?? usage.completionTokens;
        let cost = "";
        if (typeof usage.cost === "number" && Number.isFinite(usage.cost)) {
          cost = ` · $${usage.cost.toFixed(4)}`;
        } else {
          const m = models.find((x) => x.id === selectedModelId);
          if (m && m.promptPrice != null && m.completionPrice != null && pt != null && ct != null) {
            cost = ` · ~$${(pt * m.promptPrice + ct * m.completionPrice).toFixed(4)}`;
          }
        }
        tail = ` · ${pt ?? "?"} in / ${ct ?? "?"} out tokens${cost}`;
      }
      setStatus(`Done in ${secs}s${tail}.`);
      renderResult(parseResponse(streamingText, { defaultExt: extensionFor(langSelect.value) }), finishReason);
    }
  } catch (err) {
    setPhase("");
    if (err?.name === "AbortError") setStatus("Stopped.");
    else setStatus(err?.message || "Request failed.");
  } finally {
    stopElapsed();
    aborter = null;
    stopBtn.hidden = true;
    statusEl.classList.remove("live");
    compileBtn.classList.remove("running");
    compileBtn.querySelector(".btn-text").textContent = "Compile";
    updateCompileBtn();
  }
}

compileBtn.addEventListener("click", compile);
stopBtn.addEventListener("click", () => aborter?.abort());

// ---- boot --------------------------------------------------------------------
const HELLO_PROGRAM = `// hello.cf: a minimal Cƒ program. Edit it, or upload your own .cf file.

const int MAX = 20;

// Empty body: the AI implements it from the name, the signature and this comment.
fn bool is_prime(int n) {}

// Written body: transpiled exactly as you wrote it.
fn main() {
    for (int i = 1; i <= MAX; i++) {
        if (is_prime(i)) {
            print(i + " is prime");
        }
    }
    AI_ASSIST { print one friendly closing line that mentions MAX }
}
`;

initNotice(() => {
  // The banner is non-blocking: page load stays same-origin, and the first
  // openrouter.ai request needs an explicit action ("Got it", opening the
  // model picker, or "Compile").
  loadModels();
});
setProgram(HELLO_PROGRAM, "hello.cf");
updateCompileBtn();
