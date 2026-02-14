# InduForm

**Industrial Terraform** - Declarative IEC 62443 zone/conduit security for OT networks

[![CI](https://github.com/mniedermaier/InduForm/actions/workflows/ci.yml/badge.svg)](https://github.com/mniedermaier/InduForm/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.2.0--alpha-blue.svg)](https://github.com/mniedermaier/InduForm)
[![Python](https://img.shields.io/badge/python-3.11+-green.svg)](https://python.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

InduForm enables infrastructure-as-code for OT (Operational Technology) network security. Define your zones, conduits, and assets visually or in YAML, and InduForm will validate them against IEC 62443 policies, generate firewall rules, VLAN mappings, and compliance reports.

## Features

### Core Features
- **Visual Editor**: Drag-and-drop zone/conduit topology editor using React Flow
- **Declarative Configuration**: Define zones, conduits, and assets in human-readable YAML
- **IEC 62443 Compliance**: Built-in validation against IEC 62443-3-3 security requirements
- **Policy Engine**: Automatic enforcement of security policies (default deny, DMZ requirements, etc.)
- **Generators**: Generate firewall rules, VLAN mappings, and compliance reports
- **Risk Assessment**: Automated risk scoring based on security levels and asset criticality

### Collaboration Features
- **Multi-User Accounts**: User registration with email/username authentication
- **Teams**: Create teams and share projects with role-based access (Owner/Editor/Viewer)
- **Real-time Collaboration**: See who's viewing and editing with live cursor tracking
- **Comments & Annotations**: Add threaded comments to zones, conduits, and assets
- **Version History**: Track all changes with snapshots and rollback capability
- **Activity Log**: Full audit trail of all project modifications
- **Notifications**: In-app notifications for project updates and mentions

### Import/Export
- **YAML Import/Export**: Full project serialization to/from YAML
- **CSV Import**: Bulk import zones and assets from spreadsheets
- **Nmap Import**: Import network scan results to auto-discover assets
- **PDF Reports**: Generate professional compliance reports for audits
- **Templates**: Save and reuse project configurations

### REST API
- Full REST API for integration with CI/CD pipelines and other tools
- WebSocket support for real-time updates
- Swagger/OpenAPI documentation included

## Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/induform/induform.git
cd induform

# Start with Docker Compose
docker compose up -d

# Open http://localhost:8081 in your browser
```

The first time you access the app, you'll need to register an account.

## Screenshots

The web UI features a modern dark theme with an animated network background visualizing zones and conduits.

## Installation

### Using Docker Compose (Recommended)

```bash
# Start the application
docker compose up -d

# View logs
docker compose logs -f

# Stop the application
docker compose down

# Rebuild after code changes
docker rm -f induform && docker compose build && docker compose up -d
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/induform/induform.git
cd induform

# Create Python virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python package
pip install -e ".[dev]"

# Initialize the database
induform db init

# Install web UI dependencies
cd web && npm install && cd ..

# Start backend (terminal 1)
induform serve --reload --port 8080

# Start frontend dev server (terminal 2)
cd web && npm run dev
```

The frontend dev server runs on http://localhost:5173 and proxies API requests to the backend.

## User Guide

### Creating an Account

1. Open the application in your browser
2. Click "Create one" on the login page
3. Fill in your email, username, and password
4. Click "Create Account"

### Creating a Project

1. Log in to your account
2. Click "New Project" on the projects page
3. Choose a template or start with an empty project
4. Enter a project name and description
5. Click "Create"

### Working with Zones

- **Add Zone**: Click the "Add Zone" button or right-click on the canvas
- **Edit Zone**: Click on a zone to select it, then edit properties in the panel
- **Move Zone**: Drag zones to reposition them
- **Delete Zone**: Select a zone and press Delete or use the context menu

### Working with Conduits

- **Add Conduit**: Click "Add Conduit" and select source and destination zones
- **Edit Flows**: Click on a conduit to add/remove protocol flows
- **Delete Conduit**: Select a conduit and press Delete

### Version History

1. Click "Project" menu → "Version History"
2. View timeline of all changes
3. Click "Restore" to roll back to a previous version
4. Compare versions to see what changed

### Sharing Projects

1. Click the "Share" button or use the three-dot menu
2. Search for users or teams by username/email
3. Select permission level (Viewer or Editor)
4. Click "Share"

### Teams

1. Click "My Teams" in the header
2. Create a new team or manage existing teams
3. Add members by username or email
4. Share projects with the entire team

### Templates

1. Open "Templates" from the projects page
2. Browse built-in templates or create your own
3. Click "Use Template" to create a project from a template
4. Save your projects as templates for reuse

## Configuration

### Project YAML Format

Projects can be exported to and imported from YAML:

```yaml
version: "1.0"
project:
  name: "Manufacturing Plant Alpha"
  description: "Example plant configuration"
  standard: "IEC62443"

zones:
  - id: enterprise
    name: "Enterprise Network"
    type: enterprise
    security_level_target: 1

  - id: dmz
    name: "Site DMZ"
    type: dmz
    security_level_target: 3
    assets:
      - id: historian
        name: "Process Historian"
        type: historian
        ip_address: "10.1.1.10"

  - id: cell_01
    name: "Production Cell 01"
    type: cell
    security_level_target: 2
    assets:
      - id: plc_01
        name: "Main PLC"
        type: plc
        ip_address: "10.10.1.10"

conduits:
  - id: cell_to_dmz
    from_zone: cell_01
    to_zone: dmz
    flows:
      - protocol: opcua
        port: 4840
        direction: outbound
```

### Zone Types

| Type | Description | Typical SL-T |
|------|-------------|--------------|
| `enterprise` | Corporate IT network | 1 |
| `site` | Site-wide supervisory systems | 2 |
| `dmz` | Demilitarized zone | 3 |
| `area` | Area supervisory control | 2 |
| `cell` | Basic control zone | 2-3 |
| `safety` | Safety instrumented systems | 3-4 |

### Security Levels (SL-T)

| Level | Protection Against |
|-------|-------------------|
| SL 1 | Casual or coincidental violation |
| SL 2 | Intentional violation using simple means |
| SL 3 | Sophisticated attack with moderate resources |
| SL 4 | State-sponsored attack with extensive resources |

### Asset Types

- `plc` - Programmable Logic Controller
- `hmi` - Human Machine Interface
- `scada` - SCADA Server
- `engineering_workstation` - Engineering Workstation
- `historian` - Data Historian
- `jump_host` - Secure Access Jump Host
- `firewall` - Firewall
- `switch` - Network Switch
- `router` - Router
- `server` - General Server
- `rtu` - Remote Terminal Unit
- `ied` - Intelligent Electronic Device
- `dcs` - Distributed Control System
- `other` - Other Device

## Policy Rules

InduForm enforces these IEC 62443 security policies:

| Rule | Description |
|------|-------------|
| Default Deny | All traffic must be explicitly allowed via conduits |
| SL Boundary Protection | Conduits spanning SL difference >= 2 require inspection |
| Protocol Allowlist | Only approved industrial protocols are permitted |
| Cell Zone Isolation | Cell zones must not have direct connectivity |
| DMZ Requirement | Enterprise to cell traffic must traverse DMZ |
| Safety Zone Protection | Safety zones require SL-T >= 3 and limited connectivity |

## CLI Commands

```bash
# Database management
induform db init                    # Initialize database
induform db migrate                 # Run migrations

# Project operations (single-file mode)
induform init [--name NAME]         # Initialize new project
induform validate [CONFIG]          # Validate configuration
induform generate firewall|vlan|report  # Generate outputs
induform policies [CONFIG]          # Check policy rules

# Server
induform serve [--port PORT] [--host HOST] [--reload]
```

## API Documentation

When running the server, API documentation is available at:
- Swagger UI: http://localhost:8080/docs
- ReDoc: http://localhost:8080/redoc

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/projects/` | List projects |
| POST | `/api/projects/` | Create project |
| GET | `/api/projects/{id}` | Get project |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project |
| POST | `/api/projects/{id}/access` | Share project |
| GET | `/api/projects/{id}/versions/` | List version history |
| POST | `/api/projects/{id}/versions/{v}/restore` | Restore version |
| GET | `/api/templates/` | List templates |
| POST | `/api/templates/` | Create template |
| GET | `/api/teams/` | List teams |
| POST | `/api/teams/` | Create team |
| WS | `/ws/projects/{id}` | Real-time collaboration |

## Development

### CI/CD

GitHub Actions runs on every push and PR to `main` with two parallel jobs:
- **Backend**: ruff lint + format check, mypy type check, pytest with coverage
- **Frontend**: ESLint, TypeScript type check, Vitest tests, production build

### Running Tests

```bash
# Backend
pytest tests/
pytest tests/ --cov=induform --cov-report=html

# Frontend
cd web && npm run test
```

### Linting & Type Checking

```bash
# Backend
ruff check src/
ruff format --check src/
mypy src/induform

# Frontend
cd web && npm run lint
cd web && npx tsc --noEmit
```

## Technology Stack

- **Backend**: Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), Pydantic v2
- **Database**: SQLite with aiosqlite
- **Authentication**: JWT tokens, bcrypt password hashing
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Diagramming**: React Flow (@xyflow/react)
- **Real-time**: WebSocket
- **PDF Generation**: ReportLab

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+S` | Save project |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` | Copy zone |
| `Ctrl+V` | Paste zone |
| `Delete` | Delete selected |
| `Escape` | Close dialog / Clear selection |
| `?` | Show keyboard shortcuts |

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## License

MIT License - see LICENSE file for details.

## References

- [IEC 62443](https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards) - Industrial Automation and Control Systems Security
- [NIST SP 800-82](https://csrc.nist.gov/publications/detail/sp/800-82/rev-2/final) - Guide to Industrial Control Systems Security
