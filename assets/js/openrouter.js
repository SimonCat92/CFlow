// OpenRouter client. The API base URL is hardcoded on purpose: never make it
// configurable via URL/query/config, or a crafted link could redirect the
// user's API key to a hostile host. openrouter.ai is the only third-party
// origin this site ever contacts.

export const API_BASE = "https://openrouter.ai/api/v1";
export const SITE_URL = "https://simoncat92.github.io/CFlow/";
// Header values must be ASCII/Latin-1: "ƒ" would make fetch() throw.
export const SITE_TITLE = "Cf (C Flow) Playground";
export const MIN_CONTEXT = 32000;

const FETCH_OPTS = { credentials: "omit", cache: "no-store" };

// Fetches both public catalog endpoints (no auth needed, CORS is *).
// The ZDR endpoint list is required; /models is optional. If it fails the
// caller still gets zdrData and mergeModels skips the modality filter.
export async function fetchModels({ signal } = {}) {
  const get = (path) => fetch(`${API_BASE}${path}`, { ...FETCH_OPTS, signal });
  const [zdr, models] = await Promise.allSettled([
    get("/endpoints/zdr"),
    get("/models"),
  ]);
  if (zdr.status !== "fulfilled" || !zdr.value.ok) {
    const why = zdr.status === "fulfilled" ? `HTTP ${zdr.value.status}` : "network error";
    throw new Error(`Could not load the zero-data-retention endpoint list (${why}).`);
  }
  const zdrData = await zdr.value.json();
  let modelsData = null;
  if (models.status === "fulfilled" && models.value.ok) {
    try { modelsData = await models.value.json(); } catch { modelsData = null; }
  }
  return { zdrData, modelsData };
}

// Pure. Groups ZDR endpoints by model_id and merges with /models metadata.
// modelsData may be null (endpoint failed); in that case the text-output
// modality check is skipped entirely.
export function mergeModels(zdrData, modelsData) {
  const endpoints = Array.isArray(zdrData) ? zdrData : zdrData?.data;
  if (!Array.isArray(endpoints)) return [];

  const modelsArr = modelsData == null ? null : (Array.isArray(modelsData) ? modelsData : modelsData.data);
  const metaById = new Map();
  if (Array.isArray(modelsArr)) {
    for (const m of modelsArr) if (m && m.id) metaById.set(m.id, m);
  }
  const filterModality = modelsData != null;

  const groups = new Map();
  for (const ep of endpoints) {
    if (!ep || !ep.model_id) continue;
    if (!groups.has(ep.model_id)) groups.set(ep.model_id, []);
    groups.get(ep.model_id).push(ep);
  }

  const out = [];
  for (const [id, eps] of groups) {
    if (filterModality) {
      const outs = metaById.get(id)?.architecture?.output_modalities;
      if (!Array.isArray(outs) || !outs.includes("text")) continue;
    }
    let context = 0;
    let prompt = Infinity;
    let completion = Infinity;
    const providers = new Set();
    for (const ep of eps) {
      context = Math.max(context, Number(ep.context_length) || 0);
      const p = parseFloat(ep?.pricing?.prompt);
      const c = parseFloat(ep?.pricing?.completion);
      // Negative or non-finite prices mean "unknown" (some routers report -1).
      if (Number.isFinite(p) && p >= 0) prompt = Math.min(prompt, p);
      if (Number.isFinite(c) && c >= 0) completion = Math.min(completion, c);
      if (ep.provider_name) providers.add(String(ep.provider_name));
    }
    if (context < MIN_CONTEXT) continue;
    out.push({
      id,
      name: eps[0].model_name || metaById.get(id)?.name || id,
      contextLength: context,
      promptPrice: Number.isFinite(prompt) ? prompt : null,       // USD per token, null = unknown
      completionPrice: Number.isFinite(completion) ? completion : null,
      providers: [...providers].sort(),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return out;
}

// Incremental SSE parser. push() raw decoded chunks, end() at stream close.
// Events: {type:"content",text} {type:"reasoning"} {type:"finish",reason}
//         {type:"usage",usage} {type:"error",error} {type:"done"}
export function createSSEParser(onEvent) {
  let buf = "";
  let doneEmitted = false;
  const emitDone = () => {
    if (!doneEmitted) { doneEmitted = true; onEvent({ type: "done" }); }
  };

  function handleLine(line) {
    if (line.startsWith(":")) return;                    // keep-alive comments
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trimStart();
    if (!payload) return;
    if (payload === "[DONE]") { emitDone(); return; }
    let obj;
    try { obj = JSON.parse(payload); } catch { return; } // tolerate partial/junk data
    if (obj && typeof obj === "object" && obj.error) {
      onEvent({ type: "error", error: obj.error });
      return;
    }
    if (obj?.usage) onEvent({ type: "usage", usage: obj.usage });
    const choice = obj?.choices?.[0];
    if (!choice) return;
    const delta = choice.delta || {};
    if (delta.reasoning || delta.reasoning_details) onEvent({ type: "reasoning" });
    if (typeof delta.content === "string" && delta.content) {
      onEvent({ type: "content", text: delta.content });
    }
    if (choice.finish_reason) onEvent({ type: "finish", reason: choice.finish_reason });
  }

  return {
    push(chunk) {
      buf += String(chunk);
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        handleLine(line);
      }
    },
    end() {
      if (buf) { handleLine(buf); buf = ""; }
      emitDone();
    },
  };
}

export function mapHttpError(status, detail = "") {
  const d = String(detail || "").trim();
  const withDetail = (base) => (d ? `${base} ${d}` : base);
  let msg;
  if (status === 401) {
    msg = withDetail("Invalid API key (401). Check your OpenRouter key.");
  } else if (status === 402) {
    msg = withDetail("Insufficient OpenRouter credits (402). Top up your account.");
  } else if (status === 403) {
    msg = withDetail("Request blocked (403). The content may have been refused by moderation.");
  } else if (status === 404 || /no endpoints found/i.test(d)) {
    msg = "No zero-data-retention endpoint is available for this model right now. Choose another model.";
    if (d) msg += ` (${d})`;
  } else if (status === 408 || status === 429) {
    msg = withDetail(`OpenRouter is rate-limiting or timed out (${status}). Try again in a moment.`);
  } else if (status >= 500) {
    msg = withDetail(`OpenRouter or the provider returned an error (${status}). Try again later.`);
  } else {
    msg = withDetail(`Request failed (HTTP ${status}).`);
  }
  const err = new Error(msg);
  err.status = status;
  return err;
}

// Streams a chat completion. onEvent receives createSSEParser events.
export async function streamChat({ apiKey, model, messages, signal, onEvent }) {
  const res = await fetch(`${API_BASE}/chat/completions`, {
    ...FETCH_OPTS,
    method: "POST",
    signal,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE_URL,
      "X-OpenRouter-Title": SITE_TITLE,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      provider: { zdr: true, data_collection: "deny" },
    }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let detail = raw;
    try { detail = JSON.parse(raw)?.error?.message || raw; } catch { /* keep raw */ }
    throw mapHttpError(res.status, detail);
  }
  if (!res.body) throw new Error("This browser does not support streaming responses.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser(onEvent || (() => {}));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
