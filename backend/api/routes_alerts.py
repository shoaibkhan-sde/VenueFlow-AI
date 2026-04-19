"""
VenueFlow AI — Alert & Incident Engine
Maintains a live alert log and broadcasts real-time events via WebSocket.

Alerts are stored in a circular buffer (max 50).  They are emitted via the
`alert_event` Socket.IO event so the frontend can render a live feed.
"""

from collections import deque
from datetime import datetime, timezone
from flask import Blueprint, jsonify, request
from extensions import socketio

alerts_bp = Blueprint("alerts", __name__)

# ── In-memory circular alert buffer ────────────────────────
_MAX_ALERTS = 10
_alert_id_counter = 0
_alert_log: deque = deque(maxlen=_MAX_ALERTS)

# ── Staging Buffer for the 30s Heartbeat ───────────────────
# Holds alerts during the window; exactly ONE is released at the tick.
_staged_alerts: list[dict] = []

PRIORITY_MAP = {
    "critical": 3,
    "warning": 2,
    "info": 1
}


def _ts() -> str:
    """ISO-8601 UTC timestamp string."""
    return datetime.now(timezone.utc).isoformat()


def _translate(text: str) -> str:
    """Standardize venue nomenclature for messages."""
    if not text:
        return text
    mappings = {
        "East Wing": "East Stand",
        "West Wing": "West Stand",
        "South Food Court": "South Food Hub",
        "North Food Court": "North Food Hub",
        "Parking Lot A": "Parking (Zone A)",
        "east-wing": "East Stand",
        "west-wing": "West Stand",
        "food-court-north": "North Food Hub",
        "food-court-south": "South Food Hub",
    }
    for old, new in mappings.items():
        text = text.replace(old, new)
    return text


def push_alert(
    level: str,          # "info" | "warning" | "critical"
    category: str,       # "zone" | "gate" | "system" | "operator"
    title: str,
    message: str,
    entity_id: str = "",
    force_immediate: bool = False,
) -> dict:
    """
    Stages an alert for the next pulse. 
    Operator messages are forced immediately.
    """
    global _alert_id_counter
    _alert_id_counter += 1

    alert = {
        "id": _alert_id_counter,
        "timestamp": _ts(),
        "level": level,
        "category": category,
        "title": _translate(title),
        "message": _translate(message),
        "entityId": entity_id,
    }

    if force_immediate:
        _alert_log.appendleft(alert)
        socketio.emit("alert_event", alert)
    else:
        _staged_alerts.append(alert)

    return alert


def dispatch_pulse_event() -> None:
    """
    Evaluates all alerts gathered during the 30s window.
    Broadcasts the single most critical one to maintain cadence.
    """
    global _staged_alerts
    if not _staged_alerts:
        return

    # Sort: Highest priority level first, then most recent ID
    _staged_alerts.sort(
        key=lambda x: (PRIORITY_MAP.get(x["level"], 0), x["id"]),
        reverse=True
    )

    # Dispatch the winner
    pulse_event = _staged_alerts[0]
    _alert_log.appendleft(pulse_event)
    socketio.emit("alert_event", pulse_event)

    # Clear for next 30s cycle
    _staged_alerts = []


# ── Keep track of previous states to avoid repeat-firing ───
_zone_prev_status: dict[str, str] = {}
_gate_prev_heavy: dict[str, bool] = {}


def evaluate_zone_alerts(zones: list) -> None:
    """Fire alerts when a zone transitions to a worse status."""
    for z in zones:
        prev = _zone_prev_status.get(z["zoneId"], "low")
        curr = z["status"]
        if curr == prev:
            continue
        _zone_prev_status[z["zoneId"]] = curr

        if curr == "critical" and prev in ("low", "moderate", "high"):
            push_alert(
                level="critical",
                category="zone",
                title=f"🔴 {z['name']} — CRITICAL DENSITY",
                message=f"{z['name']} has reached {z['density']*100:.0f}% capacity ({z['currentOccupancy']:,} people). Redirect crowd immediately.",
                entity_id=z["zoneId"],
            )
        elif curr == "high" and prev in ("low", "moderate"):
            push_alert(
                level="warning",
                category="zone",
                title=f"🟡 {z['name']} — High Congestion",
                message=f"{z['name']} is at {z['density']*100:.0f}% capacity. Consider diverting new arrivals.",
                entity_id=z["zoneId"],
            )
        elif curr in ("low", "moderate") and prev in ("critical", "high"):
            push_alert(
                level="info",
                category="zone",
                title=f"✅ {z['name']} — Congestion Easing",
                message=f"{z['name']} density has dropped to {z['density']*100:.0f}%. Situation improving.",
                entity_id=z["zoneId"],
            )


def evaluate_gate_alerts(gates: list) -> None:
    """Fire alerts when gates cross heavy-wait threshold."""
    HEAVY_THRESHOLD_SEC = 120

    for g in gates:
        was_heavy = _gate_prev_heavy.get(g["gateId"], False)
        is_heavy = g["estimatedWaitSec"] > HEAVY_THRESHOLD_SEC and g["isOpen"]

        if is_heavy and not was_heavy:
            _gate_prev_heavy[g["gateId"]] = True
            push_alert(
                level="warning",
                category="gate",
                title=f"⏱️ {g['name']} — Long Wait",
                message=f"Wait at {g['name']} has reached {g['estimatedWaitSec']:.0f}s ({g['currentQueue']} in queue). System is re-routing fans.",
                entity_id=g["gateId"],
            )
        elif not is_heavy and was_heavy:
            _gate_prev_heavy[g["gateId"]] = False
            push_alert(
                level="info",
                category="gate",
                title=f"✅ {g['name']} — Wait Reduced",
                message=f"Queue at {g['name']} is clearing ({g['estimatedWaitSec']:.0f}s remaining).",
                entity_id=g["gateId"],
            )

        if not g["isOpen"]:
            push_alert(
                level="critical",
                category="gate",
                title=f"🚫 {g['name']} — GATE CLOSED",
                message=f"{g['name']} has been closed. Load-balancing algorithm is redistributing {g['currentQueue']} attendees to open gates.",
                entity_id=g["gateId"],
            )


# ── REST endpoints ──────────────────────────────────────────

@alerts_bp.route("/api/alerts", methods=["GET"])
def get_alerts():
    """Return the most recent alerts (newest first)."""
    return jsonify({"alerts": list(_alert_log)})


@alerts_bp.route("/api/alerts/broadcast", methods=["POST"])
def broadcast_alert():
    """
    Operator endpoint — push a custom message to all connected clients.
    Body: { "title": "...", "message": "...", "level": "info|warning|critical" }
    """
    body = request.get_json(silent=True) or {}
    alert = push_alert(
        level=body.get("level", "info"),
        category="operator",
        title=body.get("title", "📢 Venue Announcement"),
        message=body.get("message", ""),
        force_immediate=True,
    )
    return jsonify({"status": "broadcast", "alert": alert})
