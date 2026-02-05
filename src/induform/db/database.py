"""Database connection and session management."""

import logging
import os
from pathlib import Path
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
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

    from sqlalchemy import text, inspect as sa_inspect

    async with _engine.begin() as conn:
        def _get_columns(conn_sync):
            inspector = sa_inspect(conn_sync)
            proj_cols = {c["name"] for c in inspector.get_columns("projects")}
            zone_cols = {c["name"] for c in inspector.get_columns("zones")}
            return proj_cols, zone_cols

        proj_cols, zone_cols = await conn.run_sync(_get_columns)

        if "compliance_standards" not in proj_cols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN compliance_standards TEXT"))
            logger.info("Added compliance_standards column to projects table")

        await conn.execute(text(
            "UPDATE projects SET compliance_standards = '[\"' || standard || '\"]' "
            "WHERE compliance_standards IS NULL"
        ))

        if "allowed_protocols" not in proj_cols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN allowed_protocols TEXT"))
            logger.info("Added allowed_protocols column to projects table")

        await conn.execute(text(
            "UPDATE projects SET allowed_protocols = '[]' WHERE allowed_protocols IS NULL"
        ))

        if "x_position" not in zone_cols:
            await conn.execute(text("ALTER TABLE zones ADD COLUMN x_position REAL"))
            await conn.execute(text("ALTER TABLE zones ADD COLUMN y_position REAL"))
            logger.info("Added x_position, y_position columns to zones table")


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
