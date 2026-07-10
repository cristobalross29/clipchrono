# 📋 Pastport

Your passport to everything you've copied — a macOS menu-bar clipboard with memory.

## Install

```bash
npm install -g pastport
pastport
```

That's it — you never need the terminal again. Pastport lives in your menu bar and starts automatically at login.

**Requirements:** macOS, Node.js 20+. The install downloads Electron (~100MB) once. When macOS asks you to grant Accessibility for auto-paste, the app appears as "Electron" — that's Pastport's runtime.

## Use

- **⌘⇧V** anywhere → your clipboard history pops up
- **Click** any item → it's pasted right where you were (grant Accessibility once when asked)
- **Search** to find that thing you copied last Tuesday
- **📌 Pin** items you reuse; pins survive Clear
- **⌘-click** to select several items and delete them together
- **⚙︎ Settings** → change the shortcut, history size, auto-expiry, start-at-login

## What it captures

Text and images, up to 500 items (configurable). Items copied from password managers that mark them confidential are never recorded. Everything stays on your Mac in `~/Library/Application Support/Pastport` — nothing leaves your machine.

## Uninstall

Quit Pastport from Settings, then:

```bash
launchctl bootout gui/$(id -u)/com.pastport.agent
npm uninstall -g pastport
rm -rf ~/Library/Application\ Support/Pastport ~/Library/LaunchAgents/com.pastport.agent.plist
```

## License

MIT
