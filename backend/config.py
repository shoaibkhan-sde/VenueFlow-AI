"""
config.py
VenueFlow AI — Application Configuration
"""

import os
import sys

class Config:
    """Central configuration."""

    # ── Gemini AI ────────────────────────────────────────────
    GEMINI_API_KEY: str = "AIzaSyB8xjdrg_apzJ-9gWAxJKMwXcFkIwZg0lk"
    GEMINI_MODEL: str = "gemini-2.0-flash"
    DEVELOPMENT_MODE: bool = False

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # ── Maps ─────────────────────────────────────────────────
    # Using OpenStreetMap — free, no API key required.
    # Google Maps API key removed (billing setup not available).
    GOOGLE_MAPS_API_KEY: str = ""

    # ── Flask / JWT ──────────────────────────────────────────
    FLASK_ENV: str = "development"
    FLASK_DEBUG: bool = True
    SECRET_KEY: str = "venueflow_google_build_ai_prod_secret_2026_key"
    JWT_SECRET: str = os.environ.get("JWT_SECRET", SECRET_KEY)

    # ── Venue defaults ───────────────────────────────────────
    VENUE_CAPACITY: int = 100000
    SIMULATION_INTERVAL_SEC = 30.0

    # ── CORS ─────────────────────────────────────────────────
    CORS_ORIGINS: list = ["http://localhost:5173"]


# ── Startup validation ──────────────────────────────────────
if not Config.GEMINI_API_KEY or Config.GEMINI_API_KEY == "your-gemini-api-key-here":
    print(
        "[WARNING] GEMINI_API_KEY is not set!\n"
        "   The AI Assistant (/api/chat) will NOT work.\n"
        "   Get a key at: https://aistudio.google.com/apikey",
        file=sys.stderr,
    )
else:
    key = Config.GEMINI_API_KEY
    masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "****"
    print(f"[OK] GEMINI_API_KEY loaded: {masked}")

print("[OK] Maps: OpenStreetMap (no API key required)")