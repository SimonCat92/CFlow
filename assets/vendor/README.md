# Vendored dependencies

## marked.min.js

- **Package:** marked
- **Version:** 18.0.14 (published 2026-09-22; pinned at a version at least 7 days old at vendoring time)
- **Source:** https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.umd.js (the minified UMD build shipped in the npm package)
- **License:** MIT, copyright (c) 2018-2026 MarkedJS, (c) 2011-2018 Christopher Jeffrey. License header preserved at the top of the file.
- **Used by:** `book.html` and `science.html` to render Markdown documentation pages, via `assets/js/docs.js` (exposes `window.marked`).

To update: download `lib/marked.umd.js` from a pinned `marked@<version>` on npm or jsDelivr, verify the license header is intact, and replace this file.
