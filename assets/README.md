# App Icons

App icons here:

- `icon.png` — 512x512 PNG (used for Linux .deb/.rpm)
- `icon.icns` — macOS icon bundle (for .dmg)
- `icon.ico` — Windows icon (for .exe installer)

## Generate from a single PNG

Use tools like:

- **macOS**: `iconutil` to create `.icns` from an `.iconset` folder
- **Windows**: Online converters or ImageMagick: `convert icon.png icon.ico`
- **All platforms**: [electron-icon-maker](https://www.npmjs.com/package/electron-icon-maker)

```bash
npx electron-icon-maker --input=./assets/icon.png --output=./assets
```
