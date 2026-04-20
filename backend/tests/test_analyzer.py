import pytest
from backend.core.analyzer import find_fastest_gate, rebalance_crowd
from backend.core.models import Gate

@pytest.fixture
def sample_gates():
    return [
        Gate(gate_id="G1", name="North Gate", current_queue=10, throughput_rate=2.0, is_open=True),
        Gate(gate_id="G2", name="South Gate", current_queue=100, throughput_rate=1.0, is_open=True),
        Gate(gate_id="G3", name="Emergency Exit", current_queue=0, throughput_rate=0.0, is_open=False),
    ]

def test_find_fastest_gate_basic(sample_gates):
    distances = {"G1": 100, "G2": 100, "G3": 0}
    # G1 wait ~ 10/2 = 5s. G2 wait ~ 100/1 = 100s. G1 should win.
    recommendations = find_fastest_gate(sample_gates, distances, top_k=1)
    
    assert len(recommendations) == 1
    assert recommendations[0].gate.gate_id == "G1"
    assert recommendations[0].predicted_wait_seconds < 10

def test_find_fastest_gate_distance_penalty(sample_gates):
    # G1 is closer but G2 has 0 queue (overriding fixture)
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
    # 10 people incoming. G1 has rate 2, G2 has rate 1.
    # Logic: put people where they result in minimum max-wait.
    assignments = rebalance_crowd(sample_gates, total_incoming=30)
    
    # G1 should get more since it's faster
    assert assignments["G1"] > assignments["G2"]
    assert assignments.get("G3", 0) == 0

def test_no_viable_gates():
    gates = [Gate(gate_id="GX", name="Broken", current_queue=0, throughput_rate=0, is_open=False)]
    recommendations = find_fastest_gate(gates, {"GX": 0}, top_k=1)
    assert len(recommendations) == 0
