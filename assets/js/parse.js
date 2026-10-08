// Parses the transpiler's PLAN / FILE / NOTES response format (see
// assets/js/prompt.js). Pure function: string in, data out.

import { extFromInfoString } from "./languages.js";

const FILE_HEADING = /^#{1,6}\s*FILE:\s*(.+?)\s*$/i;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})(.*)$/;
const LABEL_PLAN = /\bPLAN\s*:/;
const LABEL_NOTES = /\bNOTES\s*:/;

function cleanFileName(raw) {
  // Tolerate backticks/quotes around the path.
  return String(raw || "")
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .trim();
}

function dedupe(name, used) {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem}_${i}${ext}`)) i++;
  const n = `${stem}_${i}${ext}`;
  used.add(n);
  return n;
}

export function parseResponse(text, { defaultExt = "txt" } = {}) {
  const src = String(text ?? "");
  const lines = src.split("\n");

  // Char offset of the start of each line, for plan/notes slicing.
  const offsets = [];
  let pos = 0;
  for (const line of lines) { offsets.push(pos); pos += line.length + 1; }

  // Pass 1: locate every fenced block and every FILE heading outside fences.
  // The closing rule (same char, length >= opening) applies to all fences,
  // including prose fences that will not become files.
  const fences = [];  // { openIdx, closeIdx (-1 = unterminated), lang, heading }
  const headings = []; // line indexes of FILE headings outside fences
  let inFence = null;
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFence) {
      const close = /^\s*(`+|~+)\s*$/.exec(line);
      if (close && close[1][0] === inFence.char && close[1].length >= inFence.len) {
        inFence.closeIdx = i;
        inFence.closed = true;
        fences.push(inFence);
        inFence = null;
      }
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      // Nearest preceding non-empty line (always outside a fence: a preceding
      // unclosed fence would have swallowed this line).
      let heading = null;
      for (let j = i - 1; j >= 0; j--) {
        const prev = lines[j].trim();
        if (!prev) continue;
        const h = FILE_HEADING.exec(prev);
        if (h) heading = { name: cleanFileName(h[1]), line: j };
        break;
      }
      inFence = {
        char: fence[1][0],
        len: fence[1].length,
        lang: fence[2].trim().split(/\s+/)[0] || "",
        openIdx: i,
        closeIdx: -1,
        closed: false,
        heading,
      };
      continue;
    }

    if (FILE_HEADING.exec(line.trim())) headings.push(i);
  }
  if (inFence) {
    truncated = true;
    inFence.closeIdx = lines.length - 1;
    fences.push(inFence);
  }

  const files = [];
  const used = new Set();
  const defaultName = (lang) => `main.${extFromInfoString(lang) || defaultExt}`;

  // When at least one FILE heading exists, only fences directly announced by a
  // FILE heading become files; other fences stay verbatim in the surrounding
  // prose (PLAN before the first heading, NOTES after the last file, ignored
  // between files). Without any FILE heading, every fence is a file (legacy).
  const gatedByHeadings = headings.length > 0;
  const fileFences = fences.filter((f) => (gatedByHeadings ? !!f.heading : true));

  for (const f of fileFences) {
    files.push({
      name: dedupe(f.heading?.name || defaultName(f.lang), used),
      lang: f.lang,
      code: lines.slice(f.openIdx + 1, f.closed ? f.closeIdx : lines.length).join("\n"),
    });
  }

  // Region boundaries.
  let planEnd = -1;   // offset where the plan region ends
  let notesStart = -1; // offset where the notes region begins
  if (gatedByHeadings) {
    planEnd = offsets[headings[0]];
    if (files.length) {
      const last = fileFences[fileFences.length - 1];
      notesStart = last.closed
        ? offsets[last.closeIdx] + lines[last.closeIdx].length
        : src.length;
    } else {
      notesStart = offsets[headings[headings.length - 1]] + lines[headings[headings.length - 1]].length;
    }
  } else {
    planEnd = fences.length ? offsets[fences[0].openIdx] : src.length;
    const last = fileFences[fileFences.length - 1];
    notesStart = last ? offsets[last.closeIdx] + lines[last.closeIdx].length : src.length;
  }

  // PLAN: text before the first FILE heading / fence, minus the "PLAN:" label.
  const planRegion = src.slice(0, planEnd);
  const pm = LABEL_PLAN.exec(planRegion);
  const plan = (pm ? planRegion.slice(pm.index + pm[0].length) : planRegion).trim();

  // NOTES: text after the last file's closing fence, minus the "NOTES:" label.
  let notes = "";
  if (notesStart >= 0 && notesStart < src.length) {
    const tail = src.slice(notesStart);
    const nm = LABEL_NOTES.exec(tail);
    notes = (nm ? tail.slice(nm.index + nm[0].length) : tail).trim();
  }

  return { plan, files, notes, truncated };
}
