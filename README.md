# Note & Save — Desktop

A local-first desktop note-taking app with a rich editor, whiteboards, and optional GitHub synchronization. Built with Electron, React, and TipTap.

## Features

- **Rich text editor** — headings, lists, checklists, code blocks, tables, images, highlights
- **Whiteboards** — Excalidraw-based infinite canvas
- **Folders & tags** — organize notes your way
- **Search** — instant full-text search across all notes
- **Revision history** — automatic snapshots every 5 minutes
- **Slash commands** — type `/` for quick formatting
- **Dark mode** — light and dark themes
- **Fully offline** — notes remain available without a network connection
- **Optional GitHub sync** — synchronize a portable workspace through a dedicated private repository
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

New workspaces store syncable content as readable files:

```
~/Documents/NoteAndSave/workspace/
├── .noteandsave/manifest.json
├── notes/<note-id>.md
├── folders/<folder-id>.json
├── whiteboards/<whiteboard-id>.excalidraw.json
└── assets/<asset-id>.<extension>
```

Notes use Markdown with YAML frontmatter. Stable IDs in filenames keep renames portable and reduce Git conflicts. Device-only settings, encrypted credentials, AI conversations, and local revision snapshots remain outside the synchronized repository.

Existing SQLite users are prompted to either migrate or keep their current storage. Migration is optional, stages and validates every record, and retains the original database plus a timestamped backup. Users who keep SQLite can migrate later from **Settings**; GitHub sync remains disabled until migration succeeds.

## GitHub Sync

GitHub sync requires a dedicated repository and a personal access token with access to that repository. Configure it in **Settings → GitHub Sync**. Tokens are encrypted with Electron's OS-backed `safeStorage` and are never written to the repository or remote URL.

The app writes locally first, then synchronizes automatically after saves and periodically every five minutes by default. The periodic interval is configurable in Settings. The sidebar sync icon and Settings also provide manual sync. Synchronization never force-pushes. Concurrent edits to the same item are retained as conflict copies so neither version is silently discarded.

For a repository initialized with a README, Note & Save retains the README and adds the workspace structure. A repository containing incompatible `notes`, `folders`, `whiteboards`, or `assets` data is rejected.

### Portable repository format

`.noteandsave/manifest.json` contains:

```json
{
  "schemaVersion": 1,
  "workspaceId": "stable-workspace-id",
  "createdAt": 1770000000000
}
```

Clients must reject unsupported newer schema versions without modifying the repository. Note frontmatter contains the stable ID, title, timestamps, folder ID, tags, pin/favorite/deleted flags, and note type. Images use relative `../assets/...` links. This format is the interoperability contract for future desktop, Android, and web clients.

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
- **sql.js** — legacy workspace compatibility and device-local data
- **isomorphic-git** — cross-platform Git synchronization
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
