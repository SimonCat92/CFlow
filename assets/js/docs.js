// Markdown documentation pages (book.html, science.html). Fetches the file
// named in <main data-md="...">, renders it with the vendored marked build,
// adds slug ids to h2/h3, builds the TOC, and re-highlights cf code blocks.

import { highlightCf, highlightCode } from "./highlight.js";

function slugify(text, used) {
  const base = String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "section";
  let slug = base;
  let i = 2;
  while (used.has(slug)) slug = `${base}-${i++}`;
  used.add(slug);
  return slug;
}

async function renderDoc() {
  const article = document.querySelector("[data-md]");
  const tocNav = document.getElementById("toc");
  if (!article) return;
  const src = article.getAttribute("data-md");

  article.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "muted";
  loading.textContent = "Loading…";
  article.appendChild(loading);

  let md;
  try {
    const res = await fetch(src, { credentials: "omit", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    md = await res.text();
  } catch {
    article.innerHTML = "";
    const h = document.createElement("h2");
    h.textContent = "Not available yet";
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = `The file ${src} could not be loaded. It may not exist yet, so check back soon.`;
    article.append(h, p);
    return;
  }

  article.innerHTML = window.marked.parse(md, { gfm: true });

  // Keep intra-docs links on the site: SYNTAX.md -> book.html, rules.md ->
  // science.html (hash preserved). Other relative links are left as-is.
  const PAGE_MAP = { "syntax.md": "book.html", "rules.md": "science.html" };
  for (const a of article.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute("rel", "noopener");
      continue;
    }
    const [path, hash] = href.split("#", 2);
    const base = path.replace(/^\.\//, "").toLowerCase();
    if (PAGE_MAP[base]) {
      a.setAttribute("href", PAGE_MAP[base] + (hash !== undefined ? `#${hash}` : ""));
    }
  }

  // Heading ids + table of contents.
  const used = new Set();
  const headings = [...article.querySelectorAll("h2, h3")];
  for (const h of headings) h.id = slugify(h.textContent, used);
  if (tocNav && headings.length) {
    const title = document.createElement("p");
    title.className = "toc-title";
    title.textContent = "On this page";
    const list = document.createElement("ul");
    for (const h of headings) {
      const li = document.createElement("li");
      li.className = h.tagName === "H3" ? "toc-sub" : "";
      const a = document.createElement("a");
      a.href = `#${h.id}`;
      a.textContent = h.textContent;
      li.appendChild(a);
      list.appendChild(li);
    }
    tocNav.appendChild(list);
  }

  // The TOC is a <details>: open on desktop (sticky sidebar), collapsed on
  // mobile where it sits above the article. Clicking a link closes it.
  const tocBox = tocNav?.closest("details.doc-toc");
  if (tocBox) {
    const mq = matchMedia("(min-width: 60rem)");
    const syncToc = () => { tocBox.open = mq.matches; };
    syncToc();
    mq.addEventListener("change", syncToc);
    tocNav.addEventListener("click", (e) => {
      if (e.target.closest("a") && !mq.matches) tocBox.open = false;
    });
  }

  // Wide tables scroll inside their own box instead of overflowing the page.
  for (const table of article.querySelectorAll("table")) {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    table.replaceWith(wrap);
    wrap.appendChild(table);
  }

  // Highlight code blocks: Cƒ with the dedicated highlighter, anything else
  // with the minimal generic one. Everything is escaped before innerHTML.
  for (const code of article.querySelectorAll("pre code")) {
    const lang = (code.className.match(/language-(\S+)/) || [])[1] || "";
    const text = code.textContent;
    code.innerHTML = lang === "cf" || lang === "cflow" ? highlightCf(text) : highlightCode(text, lang);
  }
}

renderDoc();
