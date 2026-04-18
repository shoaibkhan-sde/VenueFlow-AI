"""
VenueFlow AI — Gate Routing Routes
GET /api/gates           → all gate statuses
GET /api/gates/optimal   → fastest gate for a user position
POST /api/gates/rebalance → load-balance incoming crowd
"""

from flask import Blueprint, request, jsonify
from backend.core.models import Gate
from backend.core.analyzer import find_fastest_gate, rebalance_crowd
from backend.services.maps_service import distances_to_gates
from backend.services.redis_service import get_all_gates, set_gate, get_event_phase

gates_bp = Blueprint("gates", __name__)


def _gate_dict(g: Gate) -> dict:
    return {
        "gateId": g.gate_id,
        "name": g.name,
        "type": "gate",
        "zone": g.zone,
        "lat": g.latitude,
        "lon": g.longitude,
        "capacity": g.capacity,
        "currentQueue": g.current_queue,
        "throughputRate": g.throughput_rate,
        "estimatedWaitSec": round(g.estimated_wait_seconds, 1) if g.estimated_wait_seconds != float("inf") else 99999,
        "waitTime": round(g.estimated_wait_seconds / 60, 1) if g.estimated_wait_seconds != float("inf") else 999,
        "isOpen": g.is_open,
    }


@gates_bp.route("/api/gates", methods=["GET"])
def list_gates():
    """Return status of all gates."""
    gates = get_all_gates()
    return jsonify({"gates": [_gate_dict(g) for g in gates]})


@gates_bp.route("/api/gates/optimal", methods=["GET"])
def optimal_gate():
    """
    Find the fastest gate for a user.
    Query params: lat, lon, top_k (optional, default 3)
    """
    try:
        lat = float(request.args.get("lat", 23.0312))
        lon = float(request.args.get("lon", 72.5260))
        top_k = int(request.args.get("top_k", 10))
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid query parameters"}), 400

    gates = get_all_gates()
    user_dists = distances_to_gates(lat, lon, gates)
    current_phase = get_event_phase()
    results = find_fastest_gate(gates, user_dists, top_k=top_k, event_phase=current_phase)

    return jsonify({
        "recommendations": [
            {
                "gate": _gate_dict(r.gate),
                "estimatedWaitSec": round(r.estimated_wait_seconds, 1) if r.estimated_wait_seconds != float("inf") else 99999,
                "predictedWaitSec": round(r.predicted_wait_seconds, 1) if r.predicted_wait_seconds != float("inf") else 99999,
                "distanceMeters": round(r.distance_meters, 1),
                "compositeScore": r.composite_score,
            }
            for r in results
        ]
    })


@gates_bp.route("/api/gates/rebalance", methods=["POST"])
def rebalance():
    """
    Load-balance incoming attendees across open gates.
    Body: { "incomingCount": 500 }
    """
    body = request.get_json(silent=True) or {}
    count = body.get("incomingCount", 100)
    gates = get_all_gates()
    assignments = rebalance_crowd(gates, int(count))
    
    # Save modified queues into redis
    for g in gates:
        if assignments.get(g.gate_id, 0) > 0:
            set_gate(g)
            
    return jsonify({"assignments": assignments})
