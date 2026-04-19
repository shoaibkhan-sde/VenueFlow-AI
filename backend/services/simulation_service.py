"""
VenueFlow AI — Simulation Service
Runs a background thread to generate synthetic crowd data periodically.
"""

import time
import random
import threading
from services.crowd_service import process_tick_data

# Use constants from sensor_generator / config
INTERVAL_SEC = 30.0
JITTER_PCT = 0.08

ZONES_META = [
    {"zone_id": "north-stand",       "capacity": 25000, "base": 18200},
    {"zone_id": "south-stand",       "capacity": 25000, "base": 12400},
    {"zone_id": "east-wing",         "capacity": 20000, "base": 19500},
    {"zone_id": "west-wing",         "capacity": 20000, "base": 8700},
    {"zone_id": "food-court-north",  "capacity": 5000,  "base": 3200},
    {"zone_id": "food-court-south",  "capacity": 5000,  "base": 1100},
    {"zone_id": "vip-lounge",        "capacity": 2000,  "base": 850},
    {"zone_id": "parking-a",         "capacity": 3000,  "base": 2100},
]

GATES_META = [
    {"gate_id": "gate-n1",  "queue": 120, "is_open": True},
    {"gate_id": "gate-n2",  "queue": 85,  "is_open": True},
    {"gate_id": "gate-s1",  "queue": 200, "is_open": True},
    {"gate_id": "gate-s2",  "queue": 45,  "is_open": True},
    {"gate_id": "gate-e1",  "queue": 310, "is_open": True},
    {"gate_id": "gate-w1",  "queue": 60,  "is_open": True},
    {"gate_id": "gate-vip", "queue": 10,  "is_open": True},
]

def _jitter(value: int, capacity: int) -> int:
    if value == 0: value = 10
    delta = int(value * JITTER_PCT * random.uniform(-1, 1.2))
    return max(0, min(value + delta, capacity))

def generate_payload(zones, gates):
    zones_payload, gates_payload = [], []
    for zone in zones:
        zone["base"] = _jitter(zone["base"], zone["capacity"])
        zones_payload.append({"zoneId": zone["zone_id"], "occupancy": zone["base"]})
    for gate in gates:
        gate["queue"] = _jitter(gate["queue"], 1000)
        gates_payload.append({"gateId": gate["gate_id"], "queue": gate["queue"], "isOpen": gate["is_open"]})
    return {"zones": zones_payload, "gates": gates_payload, "event_phase": "Normal"}

def simulation_loop(app):
    """Background loop that executes tick every X seconds."""
    zones = [dict(z) for z in ZONES_META]
    gates = [dict(g) for g in GATES_META]
    
    print("[OK] Background Simulation Loop Started")
    
    while True:
        with app.app_context():
            try:
                payload = generate_payload(zones, gates)
                process_tick_data(payload)
                # print(f"[SIM] Tick processed ({INTERVAL_SEC}s)")
            except Exception as e:
                print(f"[SIM ERR] Failed to process background tick: {e}")
        
        time.sleep(INTERVAL_SEC)

def start_simulation(app):
    """Starts the simulation loop in a background thread."""
    thread = threading.Thread(target=simulation_loop, args=(app,), daemon=True)
    thread.start()
