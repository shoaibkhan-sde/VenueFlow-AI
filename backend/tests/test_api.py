import pytest
import json
from backend.app import create_app

@pytest.fixture
def app():
    app = create_app(testing=True)
    return app

@pytest.fixture
def client(app):
    return app.test_client()

def test_health_check(client):
    response = client.get('/api/health')
    assert response.status_code == 200
    assert response.json['status'] == 'ok'

def test_list_gates(client):
    response = client.get('/api/gates')
    assert response.status_code == 200
    assert 'gates' in response.json
    assert len(response.json['gates']) > 0

def test_optimal_gate_invalid_params(client):
    response = client.get('/api/gates/optimal?lat=abc')
    assert response.status_code == 400

def test_auth_register_login_flow(client):
    # Mocking for registry/login
    user_data = {"username": "test_pilot", "password": "secure_password"}
    
    # Register
    reg_resp = client.post('/api/auth/register', 
                            data=json.dumps(user_data),
                            content_type='application/json')
    assert reg_resp.status_code in [201, 200]

    # Login
    login_resp = client.post('/api/auth/login',
                              data=json.dumps(user_data),
                              content_type='application/json')
    assert login_resp.status_code == 200
    assert 'token' in login_resp.json

def test_unauthorized_access(client):
    # Testing protection on a protected route if we had implemented full @token_required
    # For now, verification is inside the logic, but we can verify the response structure
    pass
