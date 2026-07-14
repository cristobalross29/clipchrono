# Changelog

All notable changes to ClipChrono are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning: [SemVer](https://semver.org/).
Each release is tagged (`vX.Y.Z`) — `git checkout vX.Y.Z` reproduces exactly what was published to npm.

## [0.1.3] — 2026-07-12

### Added
- **Link-aware clips** — URLs are detected offline and shown with their domain, plus an open-in-browser button.
- **Code formatting** — code clips render in monospace with indentation and line breaks preserved.
- **Finder file capture & paste** — files copied in Finder appear as references in ClipChrono and can be pasted back to Finder or other apps.
- **Backup export & import** — Settings → Export saves clips, folders, and pins to a single file; Import merges the backup on any Mac without overwriting existing data.

## [0.1.2] — 2026-07-11

### Changed
- Package homepage now points to the project website
  (https://cristobalross29.com/clipchrono) instead of the GitHub README.

## [0.1.1] — 2026-07-10

### Added
- **Folders** — organize clips you keep into named folders (e.g. per project):
  hover a clip → 📁 → pick or create a folder; switch views with the dropdown
  next to search; rename/delete from the folder header (deleting a folder
  deletes its clips, with confirmation). Foldered clips leave the history
  stream and are exempt from the history cap, auto-expiry, and Clear.

### Fixed
- Keyboard navigation and Escape stay responsive after using the folder
  dropdown or the move-to-folder popover.
- Package description no longer references the project's pre-rename pun.

## [0.1.0] — 2026-07-09

Initial public release (as `clipchrono`; the original name `pastport` was
rejected by npm as too similar to `passport`).

### Added
- Menu-bar clipboard history for **text and images** (default 500 items,
  configurable), stored locally in `~/Library/Application Support/ClipChrono`.
- **⌘⇧V panel**: live search, click-to-auto-paste (via Accessibility),
  📌 pins that survive Clear, per-item delete, ⌘-click multi-select delete.
- **Custom shortcut recorder** — click the shortcut field in Settings and
  press any combo containing ⌘/⌃/⌥; conflicts keep your previous shortcut.
- Settings: history size, auto-delete unused items, start-at-login.
- First-run welcome flow with Accessibility setup; starts at login via a
  LaunchAgent whose paths self-heal across npm updates and folder moves.
- Privacy: content flagged confidential by password managers is never
  recorded; deduplication ignores invisible-whitespace differences so
  re-copied text never double-stacks.

[0.1.3]: https://github.com/cristobalross29/clipchrono/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/cristobalross29/clipchrono/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/cristobalross29/clipchrono/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/cristobalross29/clipchrono/releases/tag/v0.1.0
