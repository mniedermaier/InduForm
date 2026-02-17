# CLAUDE.md

InduForm: multi-user IEC 62443 zone/conduit security tool for OT networks. Python/FastAPI backend, React/TypeScript frontend.

## Commands

### Docker
```bash
docker compose up -d                                                    # Production :8081
docker rm -f induform && docker compose build && docker compose up -d   # Rebuild
docker compose --profile dev up induform-dev                            # Dev hot-reload
```

### Local dev
```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
induform db init && induform serve --reload --port 8080
cd web && npm install && npm run dev                                    # Vite :5173
```

### Testing
```bash
pytest tests/                              # Backend (needs INDUFORM_RATE_LIMIT_ENABLED=false)
cd web && npm run test                     # Frontend (Vitest + jsdom)
```

### Linting
```bash
ruff check src/ && ruff format --check src/          # Python (100 char, Python 3.11)
cd web && npm run lint && npx tsc --noEmit            # Frontend (--max-warnings 0)
```

### Demo build
```bash
cd web && npm run build:demo                          # Vite build with VITE_DEMO_MODE=true
```

### CI (.github/workflows/ci.yml)
Backend: ruff + mypy (non-blocking) + pytest --cov | Frontend: eslint + tsc + test + build

### GitHub Pages (.github/workflows/deploy-pages.yml)
On push to main: builds demo app → assembles `docs/` landing page + `web/dist/` → deploys to Pages

## Key Paths

| Area | Path |
|------|------|
| API server & middleware | `src/induform/api/server.py` |
| Routes (per-domain) | `src/induform/api/{auth,projects,teams,...}/routes.py` |
| DB models (ORM) | `src/induform/db/models.py` |
| DB migrations (runtime) | `src/induform/db/database.py` → `_ensure_columns()` |
| Pydantic models | `src/induform/models/{project,zone,conduit,asset}.py` |
| Engine (validation/policy/risk) | `src/induform/engine/` |
| Frontend editor | `web/src/components/ProjectEditor.tsx` (composes 5 hooks) |
| Frontend API client | `web/src/api/client.ts` |
| Frontend types | `web/src/types/models.ts` |
| Demo mode (MSW mocks) | `web/src/demo/{mockData,mockHandlers,enableDemoMode}.ts` |
| Landing page | `docs/index.html`, `docs/style.css` |
| Pages deploy workflow | `.github/workflows/deploy-pages.yml` |

## Adding Features

- **New dialog**: state in `useDialogs.ts` → component wrapping `DialogShell` → lazy import in `ProjectEditor.tsx`
- **New API endpoint**: route in backend sub-package → register in `server.py` → update `client.ts`. Add `@limiter.limit()` for writes.
- **New DB column**: `models.py` → Alembic migration → `_ensure_columns()` in `database.py`
- **New project operation**: `useProject.ts` with undo/redo tracking
- **New shortcut**: `useKeyboardShortcuts.ts`

## Demo Mode

The app supports a GitHub Pages demo at `/InduForm/demo/` using MSW (Mock Service Worker) to intercept all API calls with static data. Controlled by the `VITE_DEMO_MODE` env var (build-time only).

- **Mock data**: `web/src/demo/mockData.ts` — demo user, project, zones, conduits, assets
- **Mock handlers**: `web/src/demo/mockHandlers.ts` — MSW `http` handlers for all endpoints
- **Boot**: `web/src/demo/enableDemoMode.ts` — starts MSW worker + injects auth tokens
- **Banner**: `web/src/components/DemoBanner.tsx` — shown when `VITE_DEMO_MODE=true`
- **WebSocket**: `useWebSocket.ts` exports a no-op hook in demo mode (no server to connect to)
- **Vite base path**: conditional `/InduForm/demo/` in `vite.config.ts` for demo builds
- **New mock endpoint**: add handler to `mockHandlers.ts`; if it needs data, add to `mockData.ts`

## Code Conventions

- Async SQLAlchemy: always use `selectinload()` — never lazy load (causes MissingGreenlet)
- All dialogs: `DialogShell` wrapper, lazy-loaded via `React.lazy()` in ProjectEditor
- Tailwind dark mode (`dark:` variants); `z-[200]` for dropdowns (header z-20, content z-10)
- Icon-only buttons: `aria-label`; dropdown toggles: `aria-expanded` + `aria-haspopup`
- N+1 prevention: batch user lookups with `WHERE id IN (...)`
- Pydantic `ProjectMetadata.compliance_standards` (list) ≠ DB `Project.standard` (string)

## Pitfalls

- **Docker rebuild**: must `docker rm -f induform` before `docker compose build`
- **ReactFlow edges**: never set `loading=true` in `useProject.reload()` — unmounts ReactFlowProvider. Keep `selectionOnDrag={false}`.
- **slowapi**: rate-limited endpoints need `request: Request` as first param; rename body to `body` if conflict
- **Tests**: `conftest.py` sets `INDUFORM_RATE_LIMIT_ENABLED=false` before app import
- **ESLint**: `.eslintrc.cjs` (ESLint 8); `--max-warnings 0` means warnings fail CI
- **mypy**: strict mode, `continue-on-error` in CI (pre-existing errors)
- **Vite env types**: `web/src/vite-env.d.ts` must exist for `import.meta.env` to type-check
- **Demo mode**: `VITE_DEMO_MODE` is build-time only; never check it at runtime outside `import.meta.env`
