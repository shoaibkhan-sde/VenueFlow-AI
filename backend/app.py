"""
VenueFlow AI — Flask Application Factory
"""

import eventlet
eventlet.monkey_patch()

import sys
import os

# Path shim: ensures 'backend' is in sys.path so simplified imports work both locally and in Docker
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

# Removed 'backend.' prefix because Docker flattens the folder structure
from config import Config
from extensions import socketio
from api.routes_crowd import crowd_bp
from api.routes_chat import chat_bp
from api.routes_gates import gates_bp
from api.routes_alerts import alerts_bp
from api.routes_auth import auth_bp
from api.routes_config import config_bp

from services.simulation_service import start_simulation


def create_app() -> Flask:
    # Set static_folder to 'static' (where Stage 1 of Dockerfile puts React build)
    app = Flask(__name__, static_folder='static', static_url_path='')
    
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

    # ── Frontend Serving Logic (Crucial for Cloud Run) ────────
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        """
        Serves the React frontend. 
        If the file exists in 'static', serve it. 
        Otherwise, serve index.html (supports React Router).
        """
        if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        else:
            return send_from_directory(app.static_folder, 'index.html')

    # ── Health check ─────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "VenueFlow AI WS"})

    # Initialize SocketIO
    socketio.init_app(app)

    # Register socket events (Must happen after init_app in some environments)
    import api.sockets 

    # Initialize Redis Data
    try:
        # Corrected import path
        from services.redis_service import init_redis_data
        init_redis_data()
    except Exception as e:
        print(f"Failed to initialize redis data {e}")

    # ── Simulation Service ───────────────────────────────────
    # Start background data updates
    start_simulation(app)

    # Purge old history (>10) to reset to new strict requirements
    with app.app_context():
        try:
            from services.alert_service import purge_old_history
            purge_old_history()
        except: pass

    return app


# ── Production Entry Point ──────────────────────────────────
# Gunicorn looks for a variable named 'app' in this file
app = create_app()

if __name__ == "__main__":
    # log_output=False prevents terminal-killing UnicodeEncodeErrors in Windows/Docker
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, log_output=False)