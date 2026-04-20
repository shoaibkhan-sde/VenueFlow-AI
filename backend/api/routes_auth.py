"""
VenueFlow AI — Authentication Routes
POST /api/auth/register → Mock registration
POST /api/auth/login    → Returns JWT
"""

import jwt
import datetime
from functools import wraps
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from firebase_admin import auth as firebase_auth
from config import Config
from extensions import limiter

auth_bp = Blueprint("auth", __name__)

# Mock User DB (In-Memory)
_users = {}

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")
        if not token:
            return jsonify({"error": "Token is missing!"}), 401
        
        try:
            if token.startswith("Bearer "):
                token = token.split(" ")[1]
            
            # Verify Firebase ID Token
            # This is the "Gold Standard" for Google Build with AI apps
            decoded_token = firebase_auth.verify_id_token(token)
            current_user = {
                "uid": decoded_token["uid"],
                "email": decoded_token.get("email"),
                "name": decoded_token.get("name")
            }
        except Exception as e:
            return jsonify({"error": f"Token verification failed: {str(e)}"}), 401
            
        return f(current_user, *args, **kwargs)
    return decorated

@auth_bp.route("/api/auth/register", methods=["POST"])
@limiter.limit("5 per minute")
def register():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    if username in _users:
        if check_password_hash(_users[username]["password"], password):
            return jsonify({"message": "User already registered"}), 200
        return jsonify({"error": "User already exists with different credentials"}), 400
        
    # Securely hash the password before storing
    hashed_password = generate_password_hash(password)
    _users[username] = {"username": username, "password": hashed_password}
    return jsonify({"message": "User registered successfully"}), 201

@auth_bp.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    user = _users.get(username)
    if not user or not check_password_hash(user["password"], password):
        return jsonify({"error": "Invalid username or password"}), 401
        
    token = jwt.encode({
        "username": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, Config.JWT_SECRET, algorithm="HS256")
    
    return jsonify({"token": token}), 200
