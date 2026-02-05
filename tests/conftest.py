"""Pytest configuration and fixtures."""

import asyncio
import os
from typing import AsyncGenerator, Generator

# Disable rate limiting for tests — must be set before importing the app
os.environ["INDUFORM_RATE_LIMIT_ENABLED"] = "false"

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from induform.api.server import app
from induform.db import get_db, Base
from induform.db.models import User
from induform.security.password import hash_password


# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def test_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(test_engine) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client."""
    async_session = async_sessionmaker(
        test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=True,
    )

    async def override_get_db():
        async with async_session() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def test_user(test_session: AsyncSession) -> User:
    """Create a test user."""
    user = User(
        email="test@example.com",
        username="testuser",
        password_hash=hash_password("testpassword123"),
        display_name="Test User",
    )
    test_session.add(user)
    await test_session.commit()
    await test_session.refresh(user)
    return user


@pytest_asyncio.fixture(scope="function")
async def auth_headers(client: AsyncClient) -> dict:
    """Get authentication headers for a test user."""
    # Register a user
    await client.post(
        "/api/auth/register",
        json={
            "email": "auth@example.com",
            "username": "authuser",
            "password": "authpassword123",
        },
    )

    # Login
    response = await client.post(
        "/api/auth/login",
        json={
            "email_or_username": "authuser",
            "password": "authpassword123",
        },
    )

    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="function")
async def second_user_headers(client: AsyncClient) -> dict:
    """Get authentication headers for a second test user."""
    # Register a second user
    await client.post(
        "/api/auth/register",
        json={
            "email": "second@example.com",
            "username": "seconduser",
            "password": "secondpassword123",
        },
    )

    # Login
    response = await client.post(
        "/api/auth/login",
        json={
            "email_or_username": "seconduser",
            "password": "secondpassword123",
        },
    )

    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
