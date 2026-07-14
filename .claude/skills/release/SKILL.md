---
name: release
description: Cut a versioned ClipChrono release — bump the version, run tests, update CHANGELOG.md with its compare links, then commit and tag. User-invoked only; never run automatically.
disable-model-invocation: true
---

# Skill: release

Cut a versioned release of ClipChrono the way this repo already does it
(`Release X.Y.Z: <summary>` commits + `vX.Y.Z` tags, published to npm as `clipchrono`).
User-invoked only — it commits and tags, so it never runs on its own.

## When this skill is invoked

The user types `/release` optionally followed by the bump kind or explicit version:
- `/release patch` — 0.1.3 → 0.1.4 (default if unspecified)
- `/release minor` — 0.1.3 → 0.2.0
- `/release 0.2.0` — set an explicit version

## Steps

1. **Confirm a clean starting point**:
   ```sh
   git status --porcelain     # must be empty
   git rev-parse --abbrev-ref HEAD
   ```
   If dirty, stop and tell the user to commit or stash first. Confirm the branch is
   the release branch (`master`).

2. **Determine the new version** — read the current version from `package.json`, apply
   the bump or use the explicit version. Confirm the resulting string with the user
   before changing anything.

3. **Run the gate**:
   ```sh
   npm test
   ```
   There is no build step (the package ships `bin/` + `src/` raw). If tests fail,
   stop and report. Never bump or commit a broken state.

4. **Bump the version** — edit the `version` field in `package.json` directly (not
   `npm version`, which creates its own commit/tag with a different message shape).

5. **Update CHANGELOG.md** — this repo follows Keep a Changelog. Add a new section at
   the top:
   ```
   ## [X.Y.Z] — YYYY-MM-DD
   ```
   (note the em-dash `—`, matching existing entries), with `### Added` / `### Changed` /
   `### Fixed` subsections and **bold lead-in** bullets. Summarize from:
   ```sh
   git log $(git describe --tags --abbrev=0)..HEAD --oneline
   ```
   **Also add the compare link** in the reference block at the bottom of the file:
   ```
   [X.Y.Z]: https://github.com/cristobalross29/clipchrono/compare/vPREV...vX.Y.Z
   ```
   Check the footer for previous versions missing their link and add those too.

6. **Commit and tag** — match the existing convention:
   ```sh
   git add package.json CHANGELOG.md
   git commit -m "Release X.Y.Z: <one-line summary>"
   git tag vX.Y.Z
   ```

7. **Report and hand off** — show the commit and tag, then state the remaining manual
   steps explicitly (do NOT run them without confirmation):
   ```sh
   git push && git push --tags
   npm publish
   ```

8. **Sync the landing page** — after the release commit, invoke the `sync-page` skill:
   `../clipchrono-page` duplicates the version, feature list, and docs, and every
   release drifts it. A release is not finished until the page reflects it.

## Rules

- Never run automatically — only on an explicit `/release`.
- Never bump or commit on failing tests.
- Never `git push` or `npm publish` without explicit user confirmation.
- Keep the exact conventions: `Release X.Y.Z: <summary>` commit, `vX.Y.Z` tag,
  em-dash changelog headings, compare links in the footer.
- A release commit contains only `package.json` and `CHANGELOG.md` (plus source the
  user already staged).
