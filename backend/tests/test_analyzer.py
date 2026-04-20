import pytest
from core.analyzer import find_fastest_gate, rebalance_crowd
from core.models import Gate

@pytest.fixture
def sample_gates():
    return [
        # gate_id, name, zone, lat, lon, capacity, level, queue, throughput, is_open
        Gate("G1", "North Gate", "ZONE_A", 40.0, -70.0, 100, 1, 10, 2.0, True),
        Gate("G2", "South Gate", "ZONE_B", 41.0, -71.0, 100, 1, 100, 1.0, True),
        Gate("G3", "Emergency Exit", "ZONE_C", 42.0, -72.0, 50, 1, 0, 0.0, False),
    ]

def test_find_fastest_gate_basic(sample_gates):
    distances = {"G1": 100, "G2": 100, "G3": 0}
    # G1 wait ~ 10/2 = 5s. G2 wait ~ 100/1 = 100s. G1 should win.
    recommendations = find_fastest_gate(sample_gates, distances, top_k=1)
    
    assert len(recommendations) == 1
    assert recommendations[0].gate.gate_id == "G1"
    # predicted_wait_seconds in analyzer includes distance penalty (dist / walking_speed)
    # 5s (queue) - (dist / speed * rate) ... for 100m it might drain to 0
    assert recommendations[0].predicted_wait_seconds >= 0

def test_find_fastest_gate_distance_penalty(sample_gates):
    # G1 is closer to 'base' but G2 has 0 queue (overriding fixture)
    sample_gates[1].current_queue = 0
    distances = {"G1": 1000, "G2": 10} 
    
    recommendations = find_fastest_gate(sample_gates, distances, top_k=1)
    assert recommendations[0].gate.gate_id == "G2"

def test_closed_gate_ignored(sample_gates):
    distances = {"G1": 100, "G2": 100, "G3": 1}
    recommendations = find_fastest_gate(sample_gates, distances, top_k=5)
    
    # G3 is closed, so it should not be in recommendations
    gate_ids = [r.gate.gate_id for r in recommendations]
    assert "G3" not in gate_ids

def test_rebalance_crowd(sample_gates):
    # 30 people incoming. G1 has rate 2, G2 has rate 1.
    assignments = rebalance_crowd(sample_gates, total_incoming=30)
    
    # G1 should get more since it's faster
    assert assignments["G1"] > assignments["G2"]
    assert assignments.get("G3", 0) == 0

def test_no_viable_gates():
    gates = [Gate("GX", "Broken", "ZONE_X", 0, 0, 0, 1, 0, 0, False)]
    recommendations = find_fastest_gate(gates, {"GX": 0}, top_k=1)
    assert len(recommendations) == 0
