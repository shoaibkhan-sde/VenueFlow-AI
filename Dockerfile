# ── Stage 1: Build Frontend ────────────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend

# Install dependencies first for better caching
COPY frontend/package*.json ./
RUN npm install

# Copy source and build
COPY frontend/ ./
RUN npm run build


# ── Stage 2: Production Runtime ────────────────────────────
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies if any (none required for VenueFlow AI yet)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
# We copy from the backend folder to the root of our WORKDIR
COPY backend/ .

# Copy the built frontend artifacts from Stage 1 into the backend's static folder
# Stage 1 outputs to frontend/dist; stage 2 expects them in 'static'
COPY --from=frontend-build /app/frontend/dist ./static

# Ensure the static folder exists (though COPY --from should create it)
RUN ls -la ./static || echo "Static folder missing!"

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
