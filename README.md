# GL Database Client

Desktop database client for **MySQL** and **PostgreSQL**, built with **Electron**, **Vue 3**, and **TypeScript**. It supports SSH tunneling, saved connections with OS-level secret storage, SQL editing, table browsing, and large SQL import/export workflows.

## Features

- **Connections**: Save profiles with encrypted credentials (via **keytar**), reorder, export/import connection lists as JSON, optional **SSH tunnel** (password or private key).
- **Workspace**: Multi-tab query editor, table **Structure** / **Data** views, filters, foreign-key navigation, SQL history panel.
- **Data**: Edit rows (where supported), pagination, related-table navigation from FK columns.
- **SQL**: Run queries and scripts; streaming import/export for large files with progress and cancel.
- **UI**: Dark/light-friendly layout, frameless window controls, keyboard shortcuts (e.g. reload connection / tab data).

## Tech stack

| Layer | Technology |
|--------|------------|
| Desktop shell | Electron (Forge + Vite) |
| UI | Vue 3, Pinia, Element Plus |
| Language | TypeScript (strict) |
| Databases | `mysql2`, `pg` |
| SSH | `ssh2` |
| Secrets | `keytar` (native) |

Architecture follows **Clean Architecture** / **DDD**-style boundaries (domain, application, infrastructure, presentation layers).

## Prerequisites

- **Node.js** (LTS recommended) and **npm**
- **Docker** (optional) — for local MySQL/PostgreSQL test instances and the large seed dataset under `db-init/`

## Development

Install dependencies:

```bash
npm install
```

Rebuild native modules for the Electron ABI (required after install or Electron version changes):

```bash
npm run rebuild
```

Start the app in development:

```bash
npm start
```

Lint:

```bash
npm run lint
```

## Production build

```bash
npm run make
```

This runs `electron-rebuild`, prepares extra resources for native modules (`pg`, `ssh2`, etc.), and produces platform installers (see Electron Forge makers in `forge.config.ts`).

> Native addons are unpacked from the asar bundle and shipped as extra resources so they load correctly at runtime.

## Local test databases (Docker)

MySQL and PostgreSQL are defined in `docker-compose.yml`. For a **large** optional dataset (5 related tables, 1M rows each), see:

```text
db-init/README.md
```

Quick start:

```bash
docker compose up -d
```

Default example credentials (see `docker-compose.yml`):

- **MySQL**: `localhost:3306`, database `gl_db`, user `gl_user` / `gl_password`
- **PostgreSQL**: `localhost:5432`, database `gl_db`, user `gl_user` / `gl_password`

## Project layout (summary)

```text
src/
  domain/           # Entities, pure types
  application/      # Commands, queries, handlers (CQRS-style)
  infrastructure/   # DB, storage, IPC, Electron bridges
  presentation/     # Vue components, Pinia stores
  main.ts           # Electron main process
  preload.ts        # Preload context bridge
```

## Environment

- `.env` / `.env.prod` may be used for build-time or app configuration (see project files if present).

## License

MIT — see `package.json` author field.

## Author

**nvnhan0810** — [nvnhan0810.com](https://nvnhan0810.com) — nguyenvannhan0810@gmail.com
