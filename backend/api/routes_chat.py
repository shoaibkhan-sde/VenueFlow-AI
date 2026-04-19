# backend/api/routes_chat.py
"""
VenueFlow AI — Chat Routes
POST /api/chat → HTTP-only endpoint (REST / curl / external access).
WebSocket chat is handled entirely in sockets.py.
"""

from flask import Blueprint, request, jsonify
from services import gemini_service
from services.redis_service import get_all_zones
from core.models import Zone

chat_bp = Blueprint("chat", __name__)


def _build_context(zones: list[Zone]) -> str:
    lines = ["Current Venue Status:"]
    for z in zones:
        lines.append(
            f"  • {z.name}: {z.current_occupancy}/{z.capacity} ({z.status})"
        )
    return "\n".join(lines)


@chat_bp.route("/api/chat", methods=["POST"])
def chat():
    """
    Accept: { "message": "..." }
    Return: { "text": "...", "options": [...] }
    """
    body = request.get_json(silent=True) or {}
    user_msg = body.get("message", "").strip()

    if not user_msg:
        return jsonify({"error": "message is required"}), 400

    zones = get_all_zones()
    context = _build_context(zones)
    result = gemini_service.chat(user_msg, context=context)

    return jsonify({
        "text": result.get("text", ""),
        "options": result.get("options", [])
    })