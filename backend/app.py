"""
VenueFlow AI — Flask Application Factory
"""

# import eventlet
# eventlet.monkey_patch()

import sys
import os

# Path shim: ensures 'backend' is in sys.path so simplified imports work both locally and in Docker
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_talisman import Talisman

# Removed 'backend.' prefix because Docker flattens the folder structure
from config import Config
from extensions import socketio, limiter
from api.routes_crowd import crowd_bp
# ... (rest of imports)

from api.routes_chat import chat_bp
from api.routes_gates import gates_bp
from api.routes_alerts import alerts_bp
from api.routes_auth import auth_bp
from api.routes_config import config_bp

from services.simulation_service import start_simulation


def create_app(testing: bool = False) -> Flask:
    # Set static_folder to 'static' (where Stage 1 of Dockerfile puts React build)
    app = Flask(__name__, static_folder='static', static_url_path='')
    
    app.config.from_mapping(
        SECRET_KEY=Config.SECRET_KEY,
        TESTING=testing
    )

    # ── CORS ─────────────────────────────────────────────────
    CORS(app, origins=Config.CORS_ORIGINS)

    # ── Security Hardening (Talisman) ───────────────────────
    # We use a balanced CSP that allow Google Services while blocking XSS/Clickjacking
    csp = {
        'default-src': "'self'",
        'script-src': [
            "'self'",
            "'unsafe-inline'", # React 19/Vite dev mode compatibility
            'https://maps.googleapis.com',
            'https://*.firebaseapp.com',
            'https://*.googleapis.com'
        ],
        'style-src': [
            "'self'",
            "'unsafe-inline'", # Tailwind CSS compatibility
            'https://fonts.googleapis.com',
            'https://*.googleapis.com'
        ],
        'img-src': [
            "'self'", 
            'data:', 
            'https://maps.gstatic.com',
            'https://*.googleapis.com',
            'https://*.maptiler.com' # Temporary until migration complete
        ],
        'connect-src': [
            "'self'",
            'ws://localhost:*', # Development sockets
            'wss://*.cloudfunctions.net',
            'https://*.googleapis.com',
            'https://*.firebaseio.com'
        ],
        'font-src': ["'self'", 'https://fonts.gstatic.com']
    }
    
    # force_https=False for development, True in production via Config
    Talisman(app, 
             content_security_policy=csp, 
             force_https=not Config.DEVELOPMENT_MODE,
             strict_transport_security=True,
             session_cookie_secure=not Config.DEVELOPMENT_MODE)


    # ── Rate Limiting ────────────────────────────────────────
    limiter.init_app(app)

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

    # ── Startup Initialization (Stabilized & Non-Blocking) ─────
    # SKIP during tests to prevent I/O errors and background thread leaks
    if not app.config.get("TESTING"):
        try:
            from services.redis_service import init_redis_data, sync_state_to_cloud
            from services.simulation_service import start_simulation
            from services.alert_service import purge_old_history
            import threading

            # 1. Fast Seed (Redis only)
            init_redis_data()
            
            # 2. Heavy Sync (Firestore) - Run in background to prevent 503 timeouts
            threading.Thread(target=sync_state_to_cloud, daemon=True).start()
            
            # 3. Background Services
            start_simulation(app)
            
            with app.app_context():
                purge_old_history()
                
        except Exception as e:
            app.logger.warning(f"Startup Optimization Skipped: {e}")

    return app


# ── Production Entry Point ──────────────────────────────────
# Gunicorn looks for a variable named 'app' in this file.
# We avoid double-initialization during 'pytest' collection by checking sys.modules.
if "pytest" not in sys.modules:
    app = create_app()

if __name__ == "__main__":
    # If explicitly run as a script, we force create the app if it doesn't exist
    if "app" not in globals():
        app = create_app()
    # log_output=False prevents terminal-killing UnicodeEncodeErrors in Windows/Docker
    socketio.run(app, host="0.0.0.0", port=5000, debug=True, log_output=False, allow_unsafe_werkzeug=True)