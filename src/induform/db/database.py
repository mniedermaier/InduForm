"""Database connection and session management."""

import logging
import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from induform.db.models import Base

logger = logging.getLogger(__name__)

# Global engine and session factory
_engine = None
_async_session_factory = None


def get_database_url() -> str:
    """Get database URL from environment or default.

    Supports:
    - INDUFORM_DB=induform.db (SQLite file path, default)
    - INDUFORM_DB=sqlite+aiosqlite:///path/to/db (explicit SQLite URL)
    - INDUFORM_DB=postgresql+asyncpg://user:pass@host/dbname (PostgreSQL)
    """
    db_value = os.environ.get("INDUFORM_DB", "induform.db")

    # If it looks like a full URL, use as-is
    if "://" in db_value:
        # Auto-convert common postgres:// to async driver URLs
        if db_value.startswith("postgresql://") or db_value.startswith("postgres://"):
            db_value = db_value.replace("postgresql://", "postgresql+asyncpg://", 1)
            db_value = db_value.replace("postgres://", "postgresql+asyncpg://", 1)
        return db_value

    # Default: treat as SQLite file path
    return f"sqlite+aiosqlite:///{db_value}"


async def init_db(db_url: str | None = None) -> None:
    """Initialize the database engine and create tables."""
    global _engine, _async_session_factory

    if db_url is None:
        db_url = get_database_url()

    logger.info("Connecting to database: %s", db_url.split("@")[-1] if "@" in db_url else db_url)

    # For SQLite, use StaticPool for better async support
    if "sqlite" in db_url:
        _engine = create_async_engine(
            db_url,
            echo=False,
            poolclass=StaticPool,
            connect_args={"check_same_thread": False},
        )
    else:
        # PostgreSQL or other databases: use connection pooling
        _engine = create_async_engine(
            db_url,
            echo=False,
            pool_size=int(os.environ.get("INDUFORM_DB_POOL_SIZE", "5")),
            max_overflow=int(os.environ.get("INDUFORM_DB_MAX_OVERFLOW", "10")),
            pool_pre_ping=True,
        )

    _async_session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    # Create all tables
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Run lightweight column migrations for environments not using Alembic.
    # These are idempotent (skip if column already exists) and are also
    # covered by Alembic migration 004_columns for managed deployments.
    await _ensure_columns()


async def _ensure_columns() -> None:
    """Ensure columns added after the initial schema exist (idempotent)."""
    if _engine is None:
        return

    from sqlalchemy import inspect as sa_inspect
    from sqlalchemy import text

    async with _engine.begin() as conn:

        def _get_columns(conn_sync):
            inspector = sa_inspect(conn_sync)
            proj_cols = {c["name"] for c in inspector.get_columns("projects")}
            zone_cols = {c["name"] for c in inspector.get_columns("zones")}
            user_cols = {c["name"] for c in inspector.get_columns("users")}
            asset_cols = {c["name"] for c in inspector.get_columns("assets")}
            tables = set(inspector.get_table_names())
            return proj_cols, zone_cols, user_cols, asset_cols, tables

        proj_cols, zone_cols, user_cols, asset_cols, tables = await conn.run_sync(_get_columns)

        if "compliance_standards" not in proj_cols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN compliance_standards TEXT"))
            logger.info("Added compliance_standards column to projects table")

        await conn.execute(
            text(
                "UPDATE projects SET compliance_standards = '[\"' || standard || '\"]' "
                "WHERE compliance_standards IS NULL"
            )
        )

        if "allowed_protocols" not in proj_cols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN allowed_protocols TEXT"))
            logger.info("Added allowed_protocols column to projects table")

        await conn.execute(
            text("UPDATE projects SET allowed_protocols = '[]' WHERE allowed_protocols IS NULL")
        )

        if "x_position" not in zone_cols:
            await conn.execute(text("ALTER TABLE zones ADD COLUMN x_position REAL"))
            await conn.execute(text("ALTER TABLE zones ADD COLUMN y_position REAL"))
            logger.info("Added x_position, y_position columns to zones table")

        if "is_admin" not in user_cols:
            await conn.execute(
                text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL")
            )
            logger.info("Added is_admin column to users table")

        # Ensure extended asset columns exist
        new_asset_cols = {
            "os_name": "VARCHAR(255)",
            "os_version": "VARCHAR(100)",
            "software": "TEXT",
            "cpe": "VARCHAR(255)",
            "subnet": "VARCHAR(45)",
            "gateway": "VARCHAR(45)",
            "vlan": "INTEGER",
            "dns": "VARCHAR(255)",
            "open_ports": "TEXT",
            "protocols": "TEXT",
            "purchase_date": "VARCHAR(10)",
            "end_of_life": "VARCHAR(10)",
            "warranty_expiry": "VARCHAR(10)",
            "last_patched": "VARCHAR(10)",
            "patch_level": "VARCHAR(100)",
            "location": "VARCHAR(255)",
        }
        added_asset_cols = []
        for col_name, col_type in new_asset_cols.items():
            if col_name not in asset_cols:
                await conn.execute(text(f"ALTER TABLE assets ADD COLUMN {col_name} {col_type}"))
                added_asset_cols.append(col_name)
        if added_asset_cols:
            logger.info("Added columns to assets table: %s", ", ".join(added_asset_cols))

        # Ensure metrics_snapshots table exists (for environments not using Alembic)
        if "metrics_snapshots" not in tables:
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS metrics_snapshots ("
                    "  id VARCHAR(36) PRIMARY KEY,"
                    "  project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,"
                    "  recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    "  zone_count INTEGER DEFAULT 0,"
                    "  asset_count INTEGER DEFAULT 0,"
                    "  conduit_count INTEGER DEFAULT 0,"
                    "  compliance_score REAL DEFAULT 0.0,"
                    "  risk_score REAL DEFAULT 0.0,"
                    "  error_count INTEGER DEFAULT 0,"
                    "  warning_count INTEGER DEFAULT 0"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_metrics_snapshots_project_id "
                    "ON metrics_snapshots(project_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_metrics_snapshots_recorded_at "
                    "ON metrics_snapshots(recorded_at)"
                )
            )
            logger.info("Created metrics_snapshots table")

        # Ensure User columns for login tracking / force logout
        if "last_login_at" not in user_cols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN last_login_at DATETIME"))
            logger.info("Added last_login_at column to users table")
        if "force_logout_at" not in user_cols:
            await conn.execute(text("ALTER TABLE users ADD COLUMN force_logout_at DATETIME"))
            logger.info("Added force_logout_at column to users table")

        # Ensure login_attempts table exists
        if "login_attempts" not in tables:
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS login_attempts ("
                    "  id VARCHAR(36) PRIMARY KEY,"
                    "  user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,"
                    "  username_attempted VARCHAR(255) NOT NULL,"
                    "  ip_address VARCHAR(45),"
                    "  success BOOLEAN NOT NULL,"
                    "  failure_reason VARCHAR(100),"
                    "  created_at DATETIME DEFAULT CURRENT_TIMESTAMP"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_login_attempts_user_id "
                    "ON login_attempts(user_id)"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_login_attempts_created_at "
                    "ON login_attempts(created_at)"
                )
            )
            logger.info("Created login_attempts table")

        # Ensure vulnerabilities table exists (for environments not using Alembic)
        if "vulnerabilities" not in tables:
            await conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS vulnerabilities ("
                    "  id VARCHAR(36) PRIMARY KEY,"
                    "  asset_db_id VARCHAR(36) NOT NULL REFERENCES assets(id) ON DELETE CASCADE,"
                    "  cve_id VARCHAR(20) NOT NULL,"
                    "  title VARCHAR(500) NOT NULL,"
                    "  description TEXT,"
                    "  severity VARCHAR(20) NOT NULL,"
                    "  cvss_score REAL,"
                    "  status VARCHAR(20) DEFAULT 'open',"
                    "  mitigation_notes TEXT,"
                    "  discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    "  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,"
                    "  added_by VARCHAR(36) NOT NULL REFERENCES users(id)"
                    ")"
                )
            )
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_vulnerabilities_asset_db_id "
                    "ON vulnerabilities(asset_db_id)"
                )
            )
            logger.info("Created vulnerabilities table")


async def close_db() -> None:
    """Close the database engine."""
    global _engine, _async_session_factory

    if _engine:
        await _engine.dispose()
        _engine = None
        _async_session_factory = None


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session."""
    if _async_session_factory is None:
        await init_db()

    async with _async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def get_engine():
    """Get the database engine (for Alembic migrations)."""
    return _engine
