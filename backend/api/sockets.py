# backend/api/sockets.py
"""
VenueFlow AI — WebSocket Event Handlers
"""

from flask_socketio import emit
from flask import request
from extensions import socketio

# Per-session conversation history keyed by socket session ID
# { sid: [{"role": "user"|"assistant", "content": "..."}] }
_session_histories: dict[str, list[dict]] = {}
MAX_HISTORY = 5


def _get_history(sid: str) -> list[dict]:
    """Return history list for this socket session, creating if needed."""
    if sid not in _session_histories:
        _session_histories[sid] = []
    return _session_histories[sid]


@socketio.on('connect')
def handle_connect():
    _session_histories[request.sid] = []   # fresh history for this client
    print(f"[INFO] Client connected: {request.sid}")


@socketio.on('disconnect')
def handle_disconnect():
    _session_histories.pop(request.sid, None)  # clean up on disconnect
    print(f"[INFO] Client disconnected: {request.sid}")


@socketio.on('chat_message')
def handle_chat(data):
    from services import gemini_service
    from services.redis_service import get_all_zones, get_all_gates

    msg = data.get("message", "").strip()
    if not msg:
        return

    try:
        zones = get_all_zones()
        gates = get_all_gates()

        # ── Build rich real-time context ──────────────────────────
        zone_lines = "\n".join(
            f"  • {z.name}: {z.current_occupancy:,}/{z.capacity:,} "
            f"({z.status} — {z.density * 100:.0f}%)"
            for z in zones
        )
        gate_lines = "\n".join(
            f"  • {g.name} [{g.zone}]: queue={g.current_queue}, "
            f"wait={g.estimated_wait_seconds:.0f}sec, "
            f"{'OPEN' if g.is_open else 'CLOSED'}"
            for g in gates
        )

        try:
            from api.routes_alerts import _alert_log
            recent_alerts = list(_alert_log)[:5]
            alert_lines = "\n".join(
                f"  [{a['level'].upper()}] {a['title']}: {a['message']}"
                for a in recent_alerts
            ) or "  None"
        except Exception:
            alert_lines = "  None"

        # ── Per-session history ───────────────────────────────────
        history = _get_history(request.sid)
        history.append({"role": "user", "content": msg})

        # Keep history bounded
        if len(history) > MAX_HISTORY * 2:
            history.pop(0)

        # FIX: history goes into CONTEXT only, never into the message itself.
        # This means _check_intent only ever scans the user's actual new message.
        history_text = "\n".join(
            f"{'Fan' if h['role'] == 'user' else 'Assistant'}: {h['content']}"
            for h in history[:-1]   # exclude the message we just appended
        )

        context = (
            f"[Live Zone Occupancy]\n{zone_lines}\n\n"
            f"[Live Gate Status]\n{gate_lines}\n\n"
            f"[Recent Alerts]\n{alert_lines}"
        )

        # Append history to context, not to the user message
        if history_text:
            context += f"\n\n[Conversation History]\n{history_text}"

        # FIX: pass msg (clean current message only), not full_message
        reply_data = gemini_service.chat(msg, context=context)

        # Store assistant reply in this session's history
        history.append({"role": "assistant", "content": reply_data.get("text", "")})

        emit("chat_reply", reply_data)

    except Exception as e:
        emit("chat_reply", {
            "text": f"⚠️ Assistant unavailable: {str(e)}",
            "options": ["🍔 Food", "🚪 Gates", "📍 Map"]
        })