"""
VenueFlow AI — Authentication Routes
POST /api/auth/register → Mock registration
POST /api/auth/login    → Returns JWT
"""

import jwt
import datetime
from functools import wraps
from flask import Blueprint, request, jsonify
from backend.config import Config

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
            data = jwt.decode(token, Config.JWT_SECRET, algorithms=["HS256"])
            current_user = _users.get(data["username"])
            
            # Dev-Persistence: If server restarted but token is valid, self-heal the mock db
            if not current_user:
                username = data["username"]
                _users[username] = {"username": username, "password": "recovered-session"}
                current_user = _users[username]
                
        except Exception as e:
            return jsonify({"error": "Token is invalid!"}), 401
        return f(current_user, *args, **kwargs)
    return decorated

@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    if username in _users:
        if _users[username]["password"] == password:
            return jsonify({"message": "User already registered"}), 200
        return jsonify({"error": "User already exists with different credentials"}), 400
        
    _users[username] = {"username": username, "password": password}
    return jsonify({"message": "User registered successfully"}), 201

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    
    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400
        
    user = _users.get(username)
    if not user or user["password"] != password:
        return jsonify({"error": "Invalid username or password"}), 401
        
    token = jwt.encode({
        "username": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24)
    }, Config.JWT_SECRET, algorithm="HS256")
    
    return jsonify({"token": token}), 200
