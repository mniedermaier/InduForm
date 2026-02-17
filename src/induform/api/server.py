"""FastAPI server for InduForm."""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from induform.api.activity import activity_router
from induform.api.admin import admin_router
from induform.api.auth import auth_router
from induform.api.auth.routes import users_router
from induform.api.comments import comments_router
from induform.api.nmap import nmap_router
from induform.api.notifications import notifications_router
from induform.api.presence import presence_router
from induform.api.projects import projects_router
from induform.api.rate_limit import limiter
from induform.api.routes import router
from induform.api.search import search_router
from induform.api.teams import teams_router
from induform.api.templates import templates_router
from induform.api.versions import versions_router
from induform.api.vulnerabilities import vulnerabilities_router
from induform.api.websocket import websocket_router
from induform.db import close_db, init_db

logger = logging.getLogger(__name__)

# --- Logging configuration ---
_log_level = os.environ.get("INDUFORM_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, _log_level, logging.INFO),
    format="%(asctime)s %(levelname)-8s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# --- CORS configuration ---
_DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://localhost:8080,http://localhost:8081"


def _get_cors_origins() -> list[str]:
    """Parse CORS origins from INDUFORM_CORS_ORIGINS env var.

    Rejects wildcard '*' when credentials are enabled.
    """
    raw = os.environ.get("INDUFORM_CORS_ORIGINS", _DEFAULT_CORS_ORIGINS)
    if raw.strip() == "*":
        logger.warning(
            "INDUFORM_CORS_ORIGINS='*' is insecure with credentials. "
            "Using default dev origins instead."
        )
        raw = _DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


# --- Security headers middleware ---
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if os.environ.get("INDUFORM_ENV") == "production":
            response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


# --- Request logging middleware ---
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Log all API requests."""

    async def dispatch(self, request: Request, call_next):
        start = datetime.utcnow()
        response = await call_next(request)
        duration = (datetime.utcnow() - start).total_seconds() * 1000
        if request.url.path.startswith("/api/"):
            logger.info(
                "%s %s %d %.0fms",
                request.method,
                request.url.path,
                response.status_code,
                duration,
            )
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    config_path = os.environ.get("INDUFORM_CONFIG", "induform.yaml")
    app.state.config_path = Path(config_path)

    logger.info("Starting InduForm server")
    await init_db()
    logger.info("Database initialized")

    yield

    logger.info("Shutting down InduForm server")
    await close_db()


app = FastAPI(
    title="InduForm API",
    description=(
        "Industrial Terraform - Declarative IEC 62443 zone/conduit security for OT networks"
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# Attach limiter to app state (required by slowapi)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# Request logging
app.add_middleware(RequestLoggingMiddleware)

# CORS configuration for web UI
cors_origins = _get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Health / Readiness / Metrics endpoints ---
@app.get("/health")
async def health_check():
    """Health check endpoint for orchestration."""
    return {"status": "healthy"}


@app.get("/ready")
async def readiness_check():
    """Readiness check - verifies database is accessible."""
    from induform.db.database import get_engine

    engine = get_engine()
    if engine is None:
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": "database not initialized"}
        )
    try:
        from sqlalchemy import text

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        logger.error("Readiness check failed: %s", e)
        return JSONResponse(
            status_code=503, content={"status": "not ready", "reason": "database error"}
        )


@app.get("/metrics")
async def metrics():
    """Basic application metrics endpoint."""
    import sys

    from induform.api.websocket.manager import manager
    from induform.db.database import get_engine

    engine = get_engine()
    pool_status = {}
    if engine and hasattr(engine.sync_engine, "pool"):
        pool = engine.sync_engine.pool
        pool_status = {
            "pool_size": getattr(pool, "size", lambda: 0)()
            if callable(getattr(pool, "size", None))
            else getattr(pool, "_pool", {}).get("size", 0),
            "checked_out": pool.checkedout() if hasattr(pool, "checkedout") else 0,
        }

    ws_connections = sum(len(users) for users in manager.active_connections.values())

    return {
        "python_version": sys.version,
        "websocket_connections": ws_connections,
        "websocket_projects": len(manager.active_connections),
        "database": pool_status,
    }


# Include API routes with /api prefix
app.include_router(router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(teams_router, prefix="/api")
app.include_router(comments_router, prefix="/api")
app.include_router(nmap_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(activity_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(presence_router, prefix="/api")
app.include_router(versions_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(vulnerabilities_router, prefix="/api")
app.include_router(websocket_router)

# Serve static files if they exist (production build)
STATIC_DIR = Path(__file__).parent.parent.parent.parent / "static"
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/")
    async def serve_spa():
        """Serve the SPA index.html."""
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/{path:path}")
    async def serve_spa_routes(path: str):
        """Serve static files or fall back to index.html for SPA routing."""
        if path.startswith("api/") or path in ("health", "ready"):
            return FileResponse(STATIC_DIR / "index.html", status_code=404)
        file_path = STATIC_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")
