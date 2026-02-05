"""Tests for authentication API endpoints."""

import pytest
from httpx import AsyncClient


class TestAuthRegister:
    """Tests for user registration."""

    @pytest.mark.asyncio
    async def test_register_success(self, client: AsyncClient):
        """Test successful user registration."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "securepassword123",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["username"] == "newuser"
        assert "password" not in data
        assert "password_hash" not in data
        assert "id" in data

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncClient):
        """Test registration with duplicate email."""
        # Register first user
        await client.post(
            "/api/auth/register",
            json={
                "email": "duplicate@example.com",
                "username": "user1",
                "password": "password123",
            },
        )

        # Try to register with same email
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "duplicate@example.com",
                "username": "user2",
                "password": "password123",
            },
        )

        assert response.status_code == 409
        assert "already" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_duplicate_username(self, client: AsyncClient):
        """Test registration with duplicate username."""
        # Register first user
        await client.post(
            "/api/auth/register",
            json={
                "email": "user1@example.com",
                "username": "duplicateuser",
                "password": "password123",
            },
        )

        # Try to register with same username
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "user2@example.com",
                "username": "duplicateuser",
                "password": "password123",
            },
        )

        assert response.status_code == 409
        assert "already" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_weak_password(self, client: AsyncClient):
        """Test registration with weak password."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "weak@example.com",
                "username": "weakuser",
                "password": "short",
            },
        )

        assert response.status_code == 422  # Validation error

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client: AsyncClient):
        """Test registration with invalid email."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "not-an-email",
                "username": "validuser",
                "password": "validpassword123",
            },
        )

        assert response.status_code == 422  # Validation error


class TestAuthLogin:
    """Tests for user login."""

    @pytest.mark.asyncio
    async def test_login_with_email(self, client: AsyncClient):
        """Test login with email."""
        # Register
        await client.post(
            "/api/auth/register",
            json={
                "email": "login@example.com",
                "username": "loginuser",
                "password": "password123",
            },
        )

        # Login with email
        response = await client.post(
            "/api/auth/login",
            json={
                "email_or_username": "login@example.com",
                "password": "password123",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_with_username(self, client: AsyncClient):
        """Test login with username."""
        # Register
        await client.post(
            "/api/auth/register",
            json={
                "email": "loginuser2@example.com",
                "username": "loginuser2",
                "password": "password123",
            },
        )

        # Login with username
        response = await client.post(
            "/api/auth/login",
            json={
                "email_or_username": "loginuser2",
                "password": "password123",
            },
        )

        assert response.status_code == 200
        assert "access_token" in response.json()

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient):
        """Test login with wrong password."""
        # Register
        await client.post(
            "/api/auth/register",
            json={
                "email": "wrongpass@example.com",
                "username": "wrongpassuser",
                "password": "correctpassword",
            },
        )

        # Login with wrong password
        response = await client.post(
            "/api/auth/login",
            json={
                "email_or_username": "wrongpassuser",
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401
        assert "invalid" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email_or_username": "nonexistent@example.com",
                "password": "anypassword",
            },
        )

        assert response.status_code == 401


class TestAuthMe:
    """Tests for current user endpoint."""

    @pytest.mark.asyncio
    async def test_get_current_user(self, client: AsyncClient, auth_headers: dict):
        """Test getting current user info."""
        response = await client.get("/api/auth/me", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "authuser"
        assert data["email"] == "auth@example.com"

    @pytest.mark.asyncio
    async def test_get_current_user_unauthorized(self, client: AsyncClient):
        """Test getting current user without auth."""
        response = await client.get("/api/auth/me")

        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, client: AsyncClient):
        """Test getting current user with invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token"},
        )

        assert response.status_code == 401
