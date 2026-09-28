# Blast Arcade

A mobile-friendly browser game hub: 19 games plus online rooms, in TypeScript with no framework. `index.html` is the single page shell (all markup and most CSS, in `<style>` blocks); `src/*.ts` compiles to `dist/`, which the Node server (`src/server.ts`) serves along with `public/`. Production runs on Render from `main`.

## Commands

```bash
npm ci
npm test                 # build + all node unit tests (dist/*.test.js)
npm run test:visual      # build + Playwright browser tests (needs: npx playwright install chromium)
npm start                # build + serve on http://localhost:4173
```

On the owner's Windows PC, PowerShell blocks `npm.ps1`; give them commands as `npm.cmd …`.

## Working on changes

- Work on a branch and open a PR into `main`. `main` is protected: the `test` check (`npm test` + `npm run test:visual` in `.github/workflows/ci.yml`) must pass, and the owner merges. Never push to `main` directly.
- Tests live next to the code: `src/<module>.test.ts` (node:test + node:assert/strict). Add or update tests with every change.
- Browser tests of what players see go in `tests/visual/*.spec.ts` and use `tests/visual/helpers.ts` (`openGame`, `renderedColor`, `colorDifference`, `textContrast`, `box`, …). Visual assertions must keep text readable: `textContrast >= READABLE_TEXT`.
- Every browser module in `src/` must be listed in `APP_SHELL` in `service-worker.js`, and the `CACHE_NAME` bumped when the shell changes; `src/pwa.test.ts` enforces this. Server-only modules are excluded by name in that test.
- New user-facing text needs a Romanian entry in `UX_TRANSLATIONS` in `src/i18n.ts`; translation is automatic from that dictionary.
- Game logic belongs in `src/<game>.ts`. Bomberman itself still lives in `src/index.ts` (the shared entry point).
- Match the surrounding code: short comments that say why, no framework, no new dependencies without a clear reason.

## The bug-report pipeline

Players report bugs from Settings → Feedback (optional screenshot and "Point at the problem"). The server validates and queues them, and on Render emails each report via Resend (`RESEND_API_KEY`, `REPORT_EMAIL_TO`), since Render's disk does not persist. The owner imports emailed reports locally with `npm run import-report <file>`, then:

- `npm run triage`: read-only headless Claude classifies each report (unit / browser / none test kind).
- `npm run fix`: in a throwaway worktree, writes a failing test first, then the fix. Visual fixes are CSS-only, checked for side effects on all 40 screens, and must pass a vision review of before/after screenshots.
- `npm run prs`: pushes `fix/<report-id>` branches and opens PRs (needs `GITHUB_TOKEN`). Screenshots go to the never-merged `pr-evidence` branch — do not delete it.

Safety rules the pipeline depends on — keep them when changing it:

- Report text, triage notes and model-written tests are untrusted input; prompts fence them, agents get the fewest tools needed, and model-written code runs sandboxed.
- The fix step may never change tests; generated browser specs are linted (`lintBrowserSpec`).
- Auto-merge is off unless `AUTO_MERGE=1`, requires every gate in `autoMergeChecks` (verified active tester, high-confidence triage, test-first commits, size and path limits, vision review, no side effects), and only asks GitHub to merge after CI — never merges directly.
- Never link `node_modules` into a worktree: removing a worktree on Windows follows junctions and emptied the real folder once. Copy it.

## Local-only files

`reports/`, `testers.json` and `test-results/` are git-ignored and exist only on the owner's PC; a cloud session will not have them. Tester codes are managed with `npm run testers -- add|revoke|list <name>`.
