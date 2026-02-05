# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

InduForm is a multi-user IEC 62443 zone/conduit security tool for OT networks. It provides a visual editor and CLI for designing, validating, and generating industrial network security architectures. Backend is Python/FastAPI, frontend is React/TypeScript.

## Development Commands

### Docker (recommended)
```bash
docker compose up -d                    # Production on http://localhost:8081
docker rm -f induform && docker compose build && docker compose up -d  # Rebuild

# Dev mode with hot reload (mounts src/ and web/src/)
docker compose --profile dev up induform-dev
```

### Local development
```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
induform db init
induform serve --reload --port 8080     # API on http://localhost:8080

# Frontend (separate terminal)
cd web && npm install && npm run dev    # Vite on http://localhost:5173
```

### Testing
```bash
pytest tests/                           # All backend tests
pytest tests/test_models.py             # Single test file
pytest tests/ --cov=induform            # With coverage

cd web && npm run test                  # Frontend tests (Vitest + jsdom)
cd web && npm run test:watch            # Watch mode
```

### Linting & Type Checking
```bash
ruff check src/                         # Python lint (rules: E, F, I, N, W, UP)
ruff format src/                        # Python format
mypy src/induform                       # Python type check (strict)

cd web && npm run lint                  # ESLint (zero warnings policy)
cd web && npx tsc --noEmit              # TypeScript strict check
```

### CLI commands (single-file YAML mode)
```bash
induform init [--name NAME]             # Create starter YAML project
induform validate [CONFIG]              # Validate against schema + policies
induform generate firewall|vlan|report --format json|iptables|csv|cisco|md
induform policies [CONFIG]              # Check IEC 62443 policy rules
induform schema --model project|zone|conduit|asset  # Export JSON Schema
induform db init|migrate|backup|status  # Database management
```

## Architecture

### Backend (`src/induform/`)

**Entry point**: `cli.py` — Typer CLI app, `induform` command. Server runs via `induform serve` → uvicorn → `api/server.py`.

**API layer** (`api/`): FastAPI app with middleware stack: SecurityHeaders → RequestLogging → CORS → Rate limiting (slowapi). Each feature domain is a sub-package with its own router (auth/, projects/, teams/, versions/, templates/, comments/, notifications/, activity/, presence/, websocket/, nmap/). Routes are included in `server.py`. Health endpoints: `/health`, `/ready`, `/metrics`.

**Database** (`db/`): Async SQLAlchemy 2.0 with aiosqlite (SQLite) or asyncpg (PostgreSQL). `database.py` manages engine/session lifecycle. `models.py` defines all ORM models. Repositories in `db/repositories/` handle data access. Always use `selectinload()` for relationship access in async code to avoid MissingGreenlet errors.

**Domain models** (`models/`): Pydantic v2 models — `Project`, `Zone`, `Conduit`, `Asset`. These define the YAML serialization format and API schemas.

**Engine** (`engine/`): `validator.py` (schema validation with severity levels), `policy.py` (IEC 62443 policy enforcement: default deny, DMZ requirements, cell isolation, safety zone protection), `resolver.py` (security control resolution), `risk.py` (risk scoring).

**Generators** (`generators/`): `firewall.py` (JSON, iptables), `vlan.py` (JSON, CSV, Cisco), `compliance.py` (Markdown reports).

### Frontend (`web/src/`)

**State architecture**: `App.tsx` wraps everything in `AuthContext` (JWT in localStorage) and `ToastContext`. The main editor is `ProjectEditor.tsx` which composes five hooks:
- `useProject` — project CRUD, undo/redo, validation, save. `reload()` deliberately avoids setting `loading=true` to prevent ReactFlowProvider unmount (which destroys edge state).
- `useDialogs` — manages 20+ dialog open/close states
- `useWebSocket` — real-time presence, cursor tracking, selection broadcasting. Uses message queue for offline buffering and token refresh on 4001 close code.
- `useKeyboardShortcuts` — global hotkeys (Ctrl+S save, Ctrl+Z undo, etc.)
- `useProjectTabs` — multi-project tab management

**Dialogs**: All dialogs use `DialogShell` wrapper (`components/DialogShell.tsx`) which provides accessible modal behavior (ARIA attributes, focus trapping, Escape/backdrop close). Dialogs are lazy-loaded via `React.lazy()` in `ProjectEditor.tsx`.

**API client** (`api/client.ts`): Adds `Authorization: Bearer <token>` header; handles 401 → redirect to login.

**Diagramming**: React Flow (`@xyflow/react`) for zone/conduit topology. `selectionOnDrag` must stay `false` to prevent edge management interference. Also uses Three.js (`@react-three/fiber`) for the animated network background.

**Pages**: LoginPage, RegisterPage, ProjectsPage, TemplatesPage.

### Adding Features

- **New dialog**: Add state to `useDialogs.ts`, create component wrapping `DialogShell`, add lazy import in `ProjectEditor.tsx`, add open/close actions
- **New project operation**: Add to `useProject.ts` with undo/redo history tracking
- **New keyboard shortcut**: Add handler in `useKeyboardShortcuts.ts`
- **New API endpoint**: Add route in backend sub-package, register in `server.py`, update `client.ts`. Add `@limiter.limit()` decorator for write endpoints.
- **New DB column**: Add to `models.py`, create Alembic migration in `alembic/versions/`, update `_ensure_columns()` in `database.py` for backwards compatibility

## Key Domain Concepts

- **Zone**: Security zone with type (enterprise/dmz/site/area/cell/safety) and security level target (SL-T 1-4)
- **Conduit**: Connection between zones carrying protocol flows
- **Asset**: Device within a zone (PLC, HMI, SCADA, etc.)
- **Security Levels**: SL-1 casual, SL-2 simple means, SL-3 sophisticated, SL-4 state-sponsored

## Code Conventions

- Pydantic v2 models for all API request/response types
- SQLAlchemy async with `selectinload` for eager loading (never lazy load in async)
- TypeScript strict mode; `memo()` on React components for performance
- Tailwind CSS with dark mode (`dark:` variants); `z-[200]` for dropdown stacking
- All dialogs use `DialogShell` wrapper and close on Escape
- Icon-only buttons must have `aria-label`; dropdown toggles need `aria-expanded` and `aria-haspopup`
- Ruff config: Python 3.11 target, 100 char line length
- Pre-commit hooks: ruff lint+format, YAML/JSON validation, large file detection, private key detection
- Batch user lookups (N+1 prevention): use `SELECT ... WHERE id IN (...)` instead of per-row queries in activity/notification endpoints

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `INDUFORM_CONFIG` | `induform.yaml` | Config file path |
| `INDUFORM_DB` | `induform.db` | Database path/URL |
| `INDUFORM_PORT` | `8081` | Docker host port |
| `INDUFORM_CORS_ORIGINS` | `localhost:5173,8080,8081` | CORS allowed origins |
| `INDUFORM_LOG_LEVEL` | `INFO` | Log level |
| `INDUFORM_ENV` | — | Set `production` for HSTS headers |
| `VITE_PORT` | `5173` | Dev frontend port |
| `INDUFORM_RATE_LIMIT_ENABLED` | `true` | Set `false` to disable rate limiting (used in tests) |

## Common Issues

- **MissingGreenlet**: Always eager-load relationships with `selectinload()` chains in async queries
- **JWT 401**: Access tokens expire in 30 minutes; frontend auto-redirects to login. WebSocket uses close code 4001 for expired tokens; client auto-refreshes.
- **Z-index**: Use `z-[200]` for dropdowns; header uses z-20, content z-10
- **Docker rebuild**: Must `docker rm -f induform` before `docker compose build` for changes to take effect
- **ReactFlow edge loss**: Never set `loading=true` in `useProject.reload()` — it unmounts `ReactFlowProvider` which destroys all edge state. Keep `selectionOnDrag={false}` on the ReactFlow component.
- **ProjectMetadata vs DB model**: The Pydantic `ProjectMetadata` has `compliance_standards` (list), while the DB model `Project` has `standard` (string). Don't confuse them — `project.project.compliance_standards` not `project.project.standard`.
- **Rate limit in tests**: `conftest.py` sets `INDUFORM_RATE_LIMIT_ENABLED=false` before importing the app. If adding new test files, ensure they use the shared `conftest.py` fixtures.
- **slowapi parameter naming**: Rate-limited endpoints need `request: Request` as first param. If the endpoint body is also named `request`, rename it to `body` to avoid conflicts.
