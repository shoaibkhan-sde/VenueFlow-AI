import pytest
from core.analyzer import find_fastest_gate
from core.models import Gate

def test_find_fastest_gate_empty():
    """Verify it returns empty list if no gates provided."""
    assert find_fastest_gate([], {}) == []

def test_find_fastest_gate_single():
    """Verify it works with a single gate."""
    g1 = Gate("g1", "Gate 1", "z1", 23.1, 72.1, capacity=1000, current_queue=10, throughput_rate=1.0)
    # Distance of 100m
    best_list = find_fastest_gate([g1], {"g1": 100.0})
    assert best_list[0].gate.gate_id == "g1"

def test_find_fastest_gate_logic():
    """
    Verify the priority queue logic (Time = WaitTime + TravelTime).
    """
    g1 = Gate("g1", "Far/Empty", "z1", 23.01, 72.0, capacity=1000, current_queue=0, throughput_rate=1.0)
    g2 = Gate("g2", "Close/Busy", "z1", 23.0, 72.0, capacity=1000, current_queue=200, throughput_rate=1.0)
    
    # G1: 10km away (score ~500), G2: 0m away (score 200)
    best_list = find_fastest_gate([g1, g2], {"g1": 10000.0, "g2": 0.0})
    assert best_list[0].gate.gate_id == "g2"

def test_find_fastest_gate_throughput():
    """Verify throughput rate impacts selection."""
    g1 = Gate("g1", "Slow", "z1", 23.01, 72.0, capacity=1000, current_queue=100, throughput_rate=1.0)
    g2 = Gate("g2", "Fast", "z1", 23.01, 72.0, capacity=1000, current_queue=100, throughput_rate=5.0)
    
    best_list = find_fastest_gate([g1, g2], {"g1": 100.0, "g2": 100.0})
    assert best_list[0].gate.gate_id == "g2"
