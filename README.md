# VoxCount

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
# with pnpm (recommended) or npm/yarn if you prefer
$ pnpm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ pnpm run build:win

# For macOS
$ pnpm run build:mac

# For Linux
$ pnpm run build:linux
```

### Release (automatic GitHub Release)

A helper script makes it easy to publish a new version. Usage:

1. Bump the `version` field in `package.json` (e.g. `"1.0.0"` → `"1.0.1"`).
2. Ensure `GH_TOKEN` is set in your `.env` (or in CI environment).
3. Run the release command:

```bash
$ pnpm run release
```

The script will:

1. Build the project (`pnpm build`).
2. Package the app via `electron-builder`.
3. Read the `GH_TOKEN` value and create a GitHub Release for the repository.
4. Upload the installer (`.exe`, `.dmg`, etc.) and the generated `latest.yml` to the release.

This automates the end‑to‑end deployment flow so you can ship new versions with a single command.

