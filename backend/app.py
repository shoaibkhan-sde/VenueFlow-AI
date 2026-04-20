import eventlet
eventlet.monkey_patch(socket=True, select=True, thread=True)

import sys
import os
import threading
import uuid
from flask import Flask, jsonify, send_from_directory, g
from flask_cors import CORS
from flask_talisman import Talisman

# Path shim: ensures 'backend' is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from config import Config
from extensions import socketio, limiter
from api.routes_crowd import crowd_bp
from api.routes_chat import chat_bp
from api.routes_gates import gates_bp
from api.routes_alerts import alerts_bp
from api.routes_auth import auth_bp
from api.routes_config import config_bp

def _background_preloading(app):
    """
    Perform I/O-heavy initialization in a background thread to prevent 
    Cloud Run startup timeouts (503).
    """
    with app.app_context():
        try:
            from services.redis_service import init_redis_data, sync_state_to_cloud
            from services.simulation_service import start_simulation
            from services.alert_service import purge_old_history

            # 1. Warmup Redis (Fast)
            init_redis_data()
            
            # 2. Sync to Cloud (Heavy)
            sync_state_to_cloud()
            
            # 3. Start Background Tasks
            start_simulation(app)
            purge_old_history()
            
            app.logger.info("Production Preloading Complete (Success).")
        except Exception as e:
            app.logger.error(f"Background Preloading Failed (Non-Fatal): {e}")

def create_app(testing: bool = False) -> Flask:
    # Use absolute path for static_folder to ensure resolution in Cloud Run
    base_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(base_dir, 'static')
    
    app = Flask(__name__, static_folder=static_dir, static_url_path='')
    app.url_map.strict_slashes = False
    
    app.config.from_mapping(
        SECRET_KEY=Config.SECRET_KEY,
        TESTING=testing
    )

    # ── CORS ─────────────────────────────────────────────────
    CORS(app, origins=Config.CORS_ORIGINS)

    # ── Security Hardening (Talisman) ───────────────────────
    csp = {
        'default-src': "'self'",
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:', 'https://*.googleapis.com', 'https://*.firebaseapp.com', 'https://apis.google.com'],
        'worker-src': ["'self'", 'blob:'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'https://*.googleapis.com', 'https://*.maptiler.com'],
        'connect-src': ["'self'", 'ws://localhost:*', 'wss://*.cloudrun.app', 'https://*.cloudrun.app', 'https://*.googleapis.com', 'https://*.firebaseio.com', 'https://*.maptiler.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://apis.google.com', 'https://venueflow-ai-493715.firebaseapp.com/']
    }
    
    # Initialize Talisman globally. We disable force_https at the Flask level 
    # because Cloud Run's load balancer handles SSL termination and internal 
    # health checks (HTTP) must reach the container without a 301 redirect.
    talisman = Talisman(app, 
             content_security_policy=csp, 
             force_https=False,
             session_cookie_secure=not Config.DEVELOPMENT_MODE,
             session_cookie_http_only=True,
             frame_options=None) # Set to None only if using Firebase Popup/Iframe login

    limiter.init_app(app)

    @app.before_request
    def ensure_request_id():
        g.request_id = str(uuid.uuid4())

    # ── Blueprints ───────────────────────────────────────────
    app.register_blueprint(crowd_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(gates_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(config_bp)

    # ── Smart SPA Routing (Prevents Infinite Loading) ────────
    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve(path):
        """
        Hardened asset delivery:
        1. Ensures API 404s are never masked by index.html (which crashes frontend)
        2. Serves static assets (js/css/images) with correct MIME types
        3. Falls back to index.html ONLY for extension-less SPA UI routes
        """
        # Block API fallbacks
        if path.startswith("api/"):
            return jsonify({"error": "Not Found"}), 404
            
        # Check if file exists in static folder
        full_path = os.path.join(app.static_folder, path)
        if path != "" and os.path.exists(full_path):
            return send_from_directory(app.static_folder, path)
            
        # Extension-aware fallback: If it's a file request that doesn't exist, 404 it.
        # Otherwise, assume it's a React route (no extension) and serve index.html.
        if "." in path and not path.endswith(".html"):
            return "Asset not found", 404
            
        return send_from_directory(app.static_folder, 'index.html')

    # ── Fast Health Check (Standalone HTTP Resilience) ───────
    @app.route("/api/health")
    def health():
        return jsonify({"status": "healthy"}), 200

    socketio.init_app(app, async_mode='eventlet', cors_allowed_origins="*")
    import api.sockets 

    # ── Startup Orchestration ────────────────────────────────
    if not testing:
        # Launch preloading in background via Greenthread-safe Threading
        threading.Thread(target=_background_preloading, args=(app,), daemon=True).start()

    return app

if "pytest" not in sys.modules:
    app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, log_output=False)
