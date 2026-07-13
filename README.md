# 📋 ClipChrono

A macOS menu-bar clipboard with memory — searchable history, folders for your snippets, and instant paste.

## Install

```bash
npm install -g clipchrono
clipchrono
```

That's it — you never need the terminal again. ClipChrono lives in your menu bar and starts automatically at login.

**Requirements:** macOS, Node.js 22.12+. The install downloads Electron (~100MB) once. When macOS asks you to grant Accessibility for auto-paste, the app appears as "Electron" — that's ClipChrono's runtime.

## Use

- **⌘⇧V** anywhere → your clipboard history pops up
- **Click** any item → it's pasted right where you were (grant Accessibility once when asked)
- **Search** to find that thing you copied last Tuesday
- **📁 Folders** → organize snippets you keep forever: hover a clip → 📁 → pick or create a folder (e.g. "CLI", one per project). Foldered clips leave the history stream and never expire; switch folders with the dropdown next to search
- **🔗 Links, code & files** → copied URLs show their site with an open-in-browser button, code keeps its formatting, and files copied in Finder can be pasted back anywhere
- **💾 Backup** → Settings → Export saves everything to one file; Import merges it back on any Mac (nothing gets overwritten)
- **📌 Pin** items you reuse; pins survive Clear
- **⌘-click** to select several items and delete them together
- **⚙︎ Settings** → record ANY keyboard shortcut (click the shortcut field and press your combo), history size, auto-expiry, start-at-login

## What it captures

Text, images, and files copied in Finder (as references — the file itself stays where it is), up to 500 items (configurable). Items copied from password managers that mark them confidential are never recorded. Everything stays on your Mac in `~/Library/Application Support/ClipChrono` — nothing leaves your machine.

## Uninstall

Quit ClipChrono from Settings, then:

```bash
launchctl bootout gui/$(id -u)/com.clipchrono.agent
npm uninstall -g clipchrono
rm -rf ~/Library/Application\ Support/ClipChrono ~/Library/LaunchAgents/com.clipchrono.agent.plist
```

## License

MIT
