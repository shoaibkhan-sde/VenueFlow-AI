"""
config.py
VenueFlow AI — Application Configuration
"""

import os
import sys
from dotenv import load_dotenv

# Load .env file
load_dotenv()

class Config:
    """Central configuration."""

    # ── Gemini AI ────────────────────────────────────────────
    GEMINI_API_KEY: str = os.environ.get("GOOGLE_API_KEY", "")
    GEMINI_MODEL: str = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
    DEVELOPMENT_MODE: bool = os.environ.get("FLASK_ENV", "development").lower() in ["development", "testing"]

    # ── Redis ────────────────────────────────────────────────
    REDIS_URL: str = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # ── Maps ─────────────────────────────────────────────────
    # Google Maps Platform (Migration in progress)
    GOOGLE_MAPS_API_KEY: str = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    
    # MapTiler (Legacy/Current fallback)
    MAPTILER_KEY: str = os.environ.get("MAPTILER_KEY", "")

    # ── Flask / JWT ──────────────────────────────────────────
    FLASK_ENV: str = os.environ.get("FLASK_ENV", "development")
    FLASK_DEBUG: bool = os.environ.get("FLASK_DEBUG", "True").lower() == "true"
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "venueflow_default_dev_secret_key")
    JWT_SECRET: str = os.environ.get("JWT_SECRET", SECRET_KEY)

    # ── Venue defaults ───────────────────────────────────────
    VENUE_CAPACITY: int = int(os.environ.get("VENUE_CAPACITY", 100000))
    SIMULATION_INTERVAL_SEC = float(os.environ.get("SIMULATION_INTERVAL_SEC", 30.0))

    # ── CORS ─────────────────────────────────────────────────
    CORS_ORIGINS: list = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")


# ── Startup validation ──────────────────────────────────────
_REQUIRED_VARS = ["GOOGLE_API_KEY"]
for var in _REQUIRED_VARS:
    if not os.environ.get(var):
        print(
            f"[CRITICAL] Missing required environment variable: {var}\n"
            "   Please check your .env file or deployment environment.",
            file=sys.stderr,
        )

if Config.GEMINI_API_KEY:
    key = Config.GEMINI_API_KEY
    masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "****"
    print(f"[OK] GEMINI_API_KEY loaded: {masked}")

print(f"[OK] Maps: {'Google Maps available' if Config.GOOGLE_MAPS_API_KEY else 'MapTiler enabled (Fallback mode)'}")