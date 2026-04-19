# Stage 1: Build the React frontend
FROM node:20 AS frontend-builder
WORKDIR /app/frontend

# Silence debconf and upgrade npm
ENV DEBIAN_FRONTEND=noninteractive

COPY frontend/package*.json ./
RUN npm install -g npm@11.12.1 && npm install

COPY frontend/ .
RUN npm run build


# Stage 2: Final image with Python backend + React static files
FROM python:3.10-slim
WORKDIR /app

# Silence debconf and upgrade pip
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --root-user-action=ignore --upgrade pip

COPY backend/requirements.txt ./
RUN pip install --root-user-action=ignore --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ .

# Copy built frontend from Stage 1 into the backend's static folder
# Flask will serve these files from /app/static
COPY --from=frontend-builder /app/frontend/dist ./static

# Create a non-root user for security
RUN useradd -m venueflow && chown -R venueflow:venueflow /app
USER venueflow

# Environment variables
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Cloud Run expects the app to listen on the port defined by $PORT
EXPOSE 8080

# Run the app with Gunicorn and Eventlet for Socket.IO support
# -w 1 is recommended for Socket.IO on Cloud Run to avoid state conflicts
# without a central Message Queue (Redis) configured.
# Using shell form to support $PORT expansion
CMD gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app
