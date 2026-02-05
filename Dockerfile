# InduForm Dockerfile
# Multi-stage build for Python backend and React frontend

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /app/web

# Copy package files
COPY web/package.json web/package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm install && ls -la node_modules/.bin/

# Copy source files
COPY web/ ./

# Build the frontend using local binaries
RUN ./node_modules/.bin/tsc && ./node_modules/.bin/vite build

# Stage 2: Python application
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy Python package files
COPY pyproject.toml README.md ./
COPY src/ ./src/

# Install Python dependencies
RUN pip install --no-cache-dir -e .

# Copy frontend build from stage 1
COPY --from=frontend-builder /app/web/dist /app/static

# Copy examples
COPY examples/ ./examples/

# Create directory for config
RUN mkdir -p /config

# Default config location
ENV INDUFORM_CONFIG=/config/induform.yaml

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# Default command: start the server
CMD ["induform", "serve", "--host", "0.0.0.0", "--port", "8080"]
