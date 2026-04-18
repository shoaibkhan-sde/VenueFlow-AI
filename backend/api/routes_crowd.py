"""
VenueFlow AI — Crowd Data Routes
GET /api/crowd  → current zone densities and wait-time estimates.
"""

from flask import Blueprint, jsonify
from backend.core.models import Zone
from backend.services.redis_service import get_all_zones, set_zone

crowd_bp = Blueprint("crowd", __name__)

def _zone_dict(z: Zone) -> dict:
    return {
        "zoneId": z.zone_id,
        "name": z.name,
        "type": "area",
        "capacity": z.capacity,
        "lat": z.latitude,
        "lon": z.longitude,
        "currentOccupancy": z.current_occupancy,
        "peakOccupancy": z.peak_occupancy,
        "density": round(z.density, 3),
        "status": z.status,
        "waitTime": 0,  # Areas currently don't have simulated wait times
    }


@crowd_bp.route("/api/crowd", methods=["GET"])
def get_crowd_data():
    """Return live crowd data for all zones."""
    zones = get_all_zones()
    return jsonify({
        "zones": [_zone_dict(z) for z in zones],
        "totalOccupancy": sum(z.current_occupancy for z in zones),
        "totalCapacity": sum(z.capacity for z in zones),
    })


def update_zone(zone_id: str, occupancy: int):
    """Helper called by the simulation feed to update zone occupancy."""
    zones = get_all_zones()
    for z in zones:
        if z.zone_id == zone_id:
            z.current_occupancy = max(0, min(occupancy, z.capacity))
            set_zone(z)
            break

from flask import request
from backend.extensions import socketio
from backend.services.redis_service import get_all_gates, set_gate, set_event_phase, get_event_phase
from backend.core.analyzer import find_fastest_gate, rebalance_crowd
from backend.services.maps_service import distances_to_gates
from backend.api.routes_auth import token_required

# Note: We duplicate _gate_dict temporarily for simplicity, or we should import it if it's still in routes_gates.
# Let's import it from backend.api.routes_gates to avoid duplication.
from backend.api.routes_gates import _gate_dict

@crowd_bp.route("/api/internal/tick", methods=["POST"])
@token_required
def simulation_tick(current_user):
    """Internal endpoint: Simulation feeds new zone/gate data here."""
    data = request.json or {}

    # Update event phase if present
    if "event_phase" in data:
        set_event_phase(data["event_phase"])

    # 1. Update zones
    for zone_update in data.get("zones", []):
        update_zone(zone_update["zoneId"], zone_update["occupancy"])

    # 2. Update gates (handle optional open/close from simulation)
    gates = get_all_gates()
    for gate_update in data.get("gates", []):
        for g in gates:
            if g.gate_id == gate_update["gateId"]:
                g.current_queue = max(0, gate_update["queue"])
                if "isOpen" in gate_update:
                    g.is_open = gate_update["isOpen"]
                set_gate(g)
                break

    # Re-fetch gates/zones to ensure we have the latest state
    zones = get_all_zones()
    gates = get_all_gates()

    # 3. Emit crowd update (Zones ONLY for the dashboard)
    crowd_data = {
        "zones": [_zone_dict(z) for z in zones],
        "totalOccupancy": sum(z.current_occupancy for z in zones),
        "totalCapacity": sum(z.capacity for z in zones),
    }
    socketio.emit("crowd_update", crowd_data)

    # 4. Calculate optimal gates and emit gates update
    user_dists = distances_to_gates(23.0312, 72.5260, gates)
    
    # Pass event phase into the analyzer
    current_phase = get_event_phase()
    results = find_fastest_gate(gates, user_dists, top_k=10, event_phase=current_phase)

    gate_dicts = [_gate_dict(g) for g in gates]
    gates_data = {
        "gates": gate_dicts,
        "optimal": [
            {
                "gate": _gate_dict(r.gate),
                "estimatedWaitSec": round(r.estimated_wait_seconds, 1) if r.estimated_wait_seconds != float("inf") else 99999,
                "predictedWaitSec": round(r.predicted_wait_seconds, 1) if r.predicted_wait_seconds != float("inf") else 99999,
                "distanceMeters": round(r.distance_meters, 1),
                "compositeScore": r.composite_score,
            }
            for r in results
        ]
    }
    socketio.emit("gates_update", gates_data)

    # 5. Evaluate and fire alerts (Priority Dispatcher logic)
    try:
        from backend.api.routes_alerts import (
            evaluate_zone_alerts, 
            evaluate_gate_alerts, 
            dispatch_pulse_event
        )
        evaluate_zone_alerts(crowd_data["zones"])
        evaluate_gate_alerts(gate_dicts)
        dispatch_pulse_event()  # Releases the most critical event once every 30s
    except Exception:
        pass  # Never let alert logic crash the tick

    # 6. Emit aggregated metrics for the KPI summary bar
    open_gates = [g for g in gates if g.is_open]
    avg_wait = (
        round(sum(g.estimated_wait_seconds for g in open_gates) / len(open_gates), 1)
        if open_gates and all(g.estimated_wait_seconds != float("inf") for g in open_gates) else 0
    )
    total_queuing = sum(g.current_queue for g in gates)
    critical_zones = sum(1 for z in zones if z.status == "critical")
    heavy_gates = sum(1 for g in gates if g.is_open and g.estimated_wait_seconds != float("inf") and g.estimated_wait_seconds > 120)

    if critical_zones > 0 or heavy_gates >= 2:
        alert_level = "critical"
    elif heavy_gates >= 1 or any(z.status == "high" for z in zones):
        alert_level = "elevated"
    else:
        alert_level = "normal"

    socketio.emit("metrics_update", {
        "alertLevel": alert_level,
        "criticalZones": critical_zones,
        "heavyGates": heavy_gates,
        "avgWaitSec": avg_wait,
        "totalQueuing": total_queuing,
        "totalOccupancy": crowd_data["totalOccupancy"],
        "totalCapacity": crowd_data["totalCapacity"],
        "openGates": len(open_gates),
        "totalGates": len(gates),
    })

    return jsonify({"status": "updated"})
