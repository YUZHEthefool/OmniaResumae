# OmniaResumae

A **fully client-side, templated resume builder**. Fill one form on the left, see the resume render live on the right. Bilingual (Chinese / English). Import from existing PDF / LaTeX / Markdown resumes, pull projects from GitHub, and let an **AI Copilot** generate or refine your resume through real-time, multi-turn conversation. Ship several art-style templates from one dataset. **No backend, BYO keys, your data never leaves your machine.**

> **Live preview:** <https://omnia-resumae.pages.dev/>

## Features

### Live editing & preview
- A single form panel on the left, bound to a structured schema; the right pane re-renders instantly as you type.
- Zoom control; a built-in "edit preview" mode lets you click any text in the preview and edit it in place.

### Bilingual (Chinese / English)
- Field-level `Localized = { zh?, en? }`. Structural edits happen once; AI can fill the other language.
- One-click language toggle in the top bar; both versions render correctly.

### Multiple art-style templates
One dataset switches between templates live (defaults to **Serif Classic**):
- **Serif Classic** — Source Serif, blue accent, two columns (inspired by LapisCV serif).
- **Brutalist** — black / yellow / red, thick borders, Bebas Neue + Space Mono + Noto Sans SC, main + sidebar grid.
- **Minimal / Swiss** — Inter, single column, thin rules, monochrome.
- **Magazine / Editorial** — Playfair display headings, columns, accent color.
- Adding a style is one folder + one registry line; the editor never changes.

### Multi-resume management
- Create / switch / delete multiple resumes; auto-saved to IndexedDB.

### Import & migration (browser-only)
- **Markdown** — parsed via `marked`, heuristic AST mapping.
- **LaTeX** — regex heuristics for common resume macros (`moderncv`, `res`, `\cventry`, `\item`).
- **PDF** — `pdf.js` extracts full text with page/size hints.
- **AI structuring** (recommended) — raw text is sent to the LLM with the schema; returns structured JSON validated by `zod`. Import dialog lets you review, delete, reorder before merging — never silently overwrites.

### GitHub import
- List a user's own repos + their organization repos + repos they contributed to via PR search (`/search/issues?q=author:USER+type:pr`).
- Optional PAT (stored locally) for higher rate limits and private repos.
- Pick repos → fetch languages / readme → convert to project entries. Owner vs. contributor is detected and tagged.

### AI Copilot — real conversational agent (BYO key, client-side)
- Pluggable providers via native `fetch`: **OpenAI-compatible** (OpenAI / DeepSeek / Qwen / Zhipu, support `response_format: json_object` + tool calling) and **Anthropic Claude** (browser-direct via `anthropic-dangerous-direct-browser-access`).
- **Conversational generation & refinement** — a docked right panel runs a real agent loop (`runAgentStream`): you describe what you want or ask to refine the current resume, and the agent calls **field-level tools** (`get_resume`, `set_basics`, `add_item`, `update_item`, `replace_highlights`, …) that edit the live resume in real time. Each step — assistant text, tool calls, tool results, reasoning — shows in the transcript. Per-resume chat history, per-turn undo, and a stop button.
- **Skills** — reusable instruction packs (Anthropic-Agent-Skills-style: frontmatter + body + `reference` sections for progressive disclosure). Built-ins: **通用简历 / 资深工程师 / 应届生 / 经历酥化** (experience crisping — evidence over fabrication, adapted from [Hisn00w/ASu-skills](https://github.com/Hisn00w/ASu-skills)). Import your own `.md` skill.
- **Quick actions** (kept as propose-and-accept): **Optimize & polish**, **Target-company tailoring**, **Translate** — AI proposes, you accept per-item; never auto-overwrites.
- Markdown rendering in the panel is DOMPurify-sanitized; DeepSeek-Reasoner `reasoning_content` is passed back across turns.
- Fetch the available model list from `/models` and click to select, or type any model name manually.

### Export
- **Single-page PDF** — content scaled to one A4 (compact layout, borders intact).
- **Multi-page PDF** — sliced by A4 height for fidelity (no font shrink).
- **PNG image** — export the whole resume as a PNG (same off-screen A4 render).
- **Print / Save as PDF** — isolated print window, vector text, selectable/searchable.
- Avatar is pre-cropped to a square before rendering so it never distorts on export.

### Light / Dark theme
- A sun/moon toggle in the top bar switches the editor chrome to a gray dark mode (persisted). The resume preview stays on its template background (a resume is a document for recruiters).

## Tech Stack

React + Vite + TypeScript · Tailwind (editor chrome) / scoped CSS (templates) · Zustand · Dexie (IndexedDB) · Zod. Heavy deps (`pdf.js`, `html2canvas`, `jspdf`) are dynamically imported to keep first paint light.

## Getting Started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
npm run preview  # preview the build
```

On first open, a sample resume is created automatically — edit or delete it freely.

## Configure AI / GitHub keys (BYO)

Click **Settings** in the top bar:
- **AI** — pick a provider preset (OpenAI / DeepSeek / Qwen / Zhipu / Anthropic), paste your API key (stored only in this browser's localStorage). All presets are OpenAI-compatible endpoints or Anthropic's browser-direct channel.
- **GitHub** — optional PAT for higher rate limits and private repos, stored locally.

Keys never enter resume data or exported files; calls go straight from your browser to the official service.

## Deploy

Fully static; host `dist/` anywhere:
- **Vercel / Netlify** — build command `npm run build`, output `dist`.
- **GitHub Pages** — push `dist/` to `gh-pages`. `base: './'` is set in `vite.config.ts`.

## Data & Privacy

- Resume data: IndexedDB (local browser).
- Keys: localStorage (local).
- Network: only on explicit AI / GitHub actions, direct to the official APIs. Everything else stays on your machine.

## Template Extension

Each template is a React component consuming `{ resume, locale }` plus scoped CSS, registered in `src/templates/registry.ts`. A new art style is a new folder + one import — zero editor changes.

## Acknowledgements

- [LapisCV](https://github.com/BingyanStudio/LapisCV) — Markdown + CSS resume system; import reference and serif-template inspiration.
- [Hisn00w/ASu-skills](https://github.com/Hisn00w/ASu-skills) — the "经历酥化" (experience crisping) skill methodology, adapted as a built-in skill.
- The bundled brutalist template is the initial art direction.

## License

[Apache License 2.0](./LICENSE)
