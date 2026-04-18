"""
VenueFlow AI — Flask Application Factory
"""

import sys
import os

from flask import Flask, jsonify
from flask_cors import CORS

from backend.config import Config
from backend.extensions import socketio
from backend.api.routes_crowd import crowd_bp
from backend.api.routes_chat import chat_bp
from backend.api.routes_gates import gates_bp
from backend.api.routes_alerts import alerts_bp
from backend.api.routes_auth import auth_bp
from backend.api.routes_config import config_bp

import backend.api.sockets  # Register socket events


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=Config.SECRET_KEY,
    )

    # ── CORS ─────────────────────────────────────────────────
    CORS(app, origins=Config.CORS_ORIGINS)

    # ── Blueprints ───────────────────────────────────────────
    app.register_blueprint(crowd_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(gates_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(config_bp)

    # ── Health check ─────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "VenueFlow AI WS"})

    # Initialize SocketIO
    socketio.init_app(app)

    # Initialize Redis Data
    try:
        from backend.services.redis_service import init_redis_data
        init_redis_data()
    except Exception as e:
        print(f"Failed to intialize redis data {e}")

    return app


# ── Direct run ───────────────────────────────────────────────
if __name__ == "__main__":
    application = create_app()
    # Using threading mode (default) instead of eventlet for stable Windows operation
    socketio.run(application, host="0.0.0.0", port=5000, debug=True, log_output=True)
