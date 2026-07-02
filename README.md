# Note & Save — Desktop

A local-first desktop note-taking app with a rich editor and whiteboards. Built with Electron, React, TipTap, and SQLite.

## Features

- **Rich text editor** — headings, lists, checklists, code blocks, tables, images, highlights
- **Whiteboards** — Excalidraw-based infinite canvas
- **Folders & tags** — organize notes your way
- **Search** — instant full-text search across all notes
- **Revision history** — automatic snapshots every 5 minutes
- **Slash commands** — type `/` for quick formatting
- **Dark mode** — light and dark themes
- **Fully offline** — all data stored locally in SQLite
- **Export** — Markdown, HTML, plain text, JSON

## Getting Started

```bash
# Install dependencies
npm install

# Rebuild native modules for Electron
npx electron-rebuild

# Start the app in development mode
npm start
```

## Data Storage

Notes are stored in a SQLite database at:
```
~/Documents/NoteAndSave/workspace.db
```
You can change this location in **Settings** (gear icon in the sidebar).

## Packaging & Release

### Build locally

```bash
# Package the app (unsigned app bundle)
npm run package

# Create distributable installers
npm run make
```

Output goes to `out/make/` with platform-specific formats:
| Platform | Format |
|----------|--------|
| macOS | `.dmg`, `.zip` |
| Windows | `.exe` (Squirrel installer) |
| Linux | `.deb`, `.rpm` |

### Generate app icons

Place a 512×512 PNG at `assets/icon.png`, then:
```bash
npx electron-icon-maker --input=./assets/icon.png --output=./assets
```

This generates `.icns` (macOS) and `.ico` (Windows) files.

### Release via GitHub Actions

Push a version tag to trigger the automated release workflow:
```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds on macOS, Windows, and Linux in CI and creates a draft GitHub Release with all installers attached.

## Roadmap

### Polish
- [ ] Wire up dark mode toggle persistence
- [ ] Auto-updater (OTA updates via GitHub Releases)
- [ ] Code signing (Apple Developer ID + Windows EV cert)

### Features
- [ ] Import data from the web version (IndexedDB → SQLite)
- [ ] Native Save dialog for file exports
- [ ] Keyboard shortcuts from native menu → renderer
- [ ] Window state persistence (size/position across restarts)

### Hardening
- [ ] React error boundaries
- [ ] Periodic automatic SQLite backups
- [ ] Tighten CSP (remove `unsafe-eval` if Excalidraw allows)

## Tech Stack

- **Electron 33** + Electron Forge + Vite
- **React 19** + TypeScript
- **TipTap** — rich text editor
- **Excalidraw** — whiteboard canvas
- **better-sqlite3** — fast synchronous SQLite
- **Atkinson** font — accessible, clean typography

## Project Structure

```
src/
├── main.ts                  # Electron main process entry
├── main/
│   ├── database.ts          # SQLite schema, migrations, CRUD
│   └── ipc-handlers.ts      # IPC channel registrations
├── preload.ts               # contextBridge (window.api)
├── renderer.ts              # React entry point
└── renderer/
    ├── App.tsx              # Root component
    ├── components/          # UI components
    ├── context/             # WorkspaceContext (state management)
    ├── hooks/               # useNotes, useFolders, useSearch, etc.
    ├── lib/                 # DB bridge, export, search utils
    ├── styles/              # tokens.css + workspace.css
    └── types.ts             # TypeScript interfaces
```

## License

MIT
