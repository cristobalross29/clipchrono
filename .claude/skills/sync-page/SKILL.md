---
name: sync-page
description: Use when ClipChrono's version, features, settings, or user-facing behavior changed and the landing page may be stale — after every /release, or when CHANGELOG.md has an entry the page doesn't reflect yet.
---

# Skill: sync-page

The landing page lives in the sibling repo `../clipchrono-page` (Next.js App Router,
served at cristobalross29.com/clipchrono under `basePath: /clipchrono`, **auto-deploys
on `git push` via Vercel**). All content is hand-written JSX in three files —
`app/page.jsx` (landing), `app/docs/page.jsx` (docs), `app/layout.jsx` (SEO metadata) —
so every release drifts it. This skill re-derives each duplicated fact from the app
repo and updates the page to match.

The page may already be **partially** synced (feature sections often land with the release,
metadata lags) — diff each sync point against its source; don't assume everything needs
edits, and don't stop at the first file that's already current.

## Sync points

| Fact on page | Where | Source of truth (app repo) |
| --- | --- | --- |
| Version + platform strip (`vX.Y.Z · macOS · node ≥ N · mit`) | `app/page.jsx` hero | `package.json` `version`, `os`, `engines`, `license` |
| Feature sections (folders, search, pins, shortcut, links, code, files, backup, …) | `app/page.jsx` | top entries of `CHANGELOG.md` — new features need a section, changed ones need updated copy |
| Meta title + description | `app/layout.jsx` | must name the **current** headline features; this is the spot that historically lags a release |
| Install/run/update/uninstall commands | `app/page.jsx` + `app/docs/page.jsx` | `README.md`, `package.json` `name` |
| Command/shortcut/settings tables | `app/docs/page.jsx` | `README.md` Use section + `src/main/settings.js` |
| Storage layout (`history.json`, `folders.json`, `settings.json`, `images/`) | `app/docs/page.jsx` | `src/main/store.js` |
| Item cap, hotkey, and other defaults (e.g. "500 items", ⌘⇧V) | both pages + `app/components/Popover.jsx` | `DEFAULTS` in `src/main/settings.js` |
| Backup format / default filename | `app/docs/page.jsx` | `src/main/backup.js` (format); `showSaveDialog` `defaultPath` in `src/main/index.js` (filename) |
| GitHub/npm/changelog links | both pages | `package.json` `repository`, `homepage` |

## Process

1. **Read the top `CHANGELOG.md` entry** (plus unreleased commits if any:
   `git log $(git describe --tags --abbrev=0)..HEAD --oneline`). This defines what changed.
2. **Find the version literal**: `grep -rn 'v0\.[0-9]*\.[0-9]*' app/` in the page repo,
   update every hit to the released version.
3. **Update feature copy** for anything the release added or changed — landing sections,
   the docs tables, AND `app/components/` (Popover.jsx's scripted demo quotes the hotkey
   and item cap; it drifts the same way the pages do).
4. **Check `app/layout.jsx`** — the meta description must list the same headline features
   the visible page shows. It does not update itself when `page.jsx` is edited, and it
   has drifted before.
5. **Re-verify defaults against source** (item cap, shortcut, storage paths, backup
   filename) — read `src/main/settings.js`, `src/main/store.js`, `src/main/backup.js`,
   and the `showSaveDialog` call in `src/main/index.js`; don't trust the old page copy.
6. **Build gate**: `npm run build` in `../clipchrono-page` must pass.
7. **Commit in the page repo** (separate git repo): `docs: sync page to vX.Y.Z`.
   Ask the user before `git push` — push is deploy.

## Rules

- Facts come from the app repo's source and CHANGELOG at sync time — never from memory
  and never from what the page already says.
- Work in `../clipchrono-page`'s own git repo; nothing here is committed to the app repo.
- Never push without explicit user confirmation.
