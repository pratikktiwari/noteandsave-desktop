# Note & Save Mobile

Android-first React Native client for Note & Save, built with Expo SDK 57.

## Development

```bash
# From the repository root
npm install
npm run mobile:android
```

The app uses a development build rather than Expo Go because the native rich-text editor includes Android and iOS code.

## Data

Workspace files are stored in the app document directory under `NoteAndSave/`. Notes use the same YAML-frontmatter Markdown format as the desktop app. SQLite is a rebuildable full-text-search index, not the source of truth.

Git sync is optional. Repository metadata is stored in app preferences and the GitHub token is stored with Expo Secure Store.

## Validation

```bash
npm run typecheck
npm test
npx expo export --platform android
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
```
