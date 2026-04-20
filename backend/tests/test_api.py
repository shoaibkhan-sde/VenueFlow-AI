import pytest
from app import create_app as app_factory

@pytest.fixture
def flask_app():
    app = app_factory(testing=True)
    yield app

@pytest.fixture
def client(flask_app):
    return flask_app.test_client()

def test_health_check(client):
    """Verify API health endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"

def test_auth_register_login_flow(client):
    """Verify registration and login works with hashed passwords."""
    username = f"testuser_{pytest.importorskip('time').time()}"
    password = "SecurePassword123!"
    
    # Register
    reg_resp = client.post("/api/auth/register", json={
        "username": username,
        "password": password
    })
    assert reg_resp.status_code == 201
    
    # Login
    login_resp = client.post("/api/auth/login", json={
        "username": username,
        "password": password
    })
    assert login_resp.status_code == 200
    assert "token" in login_resp.get_json()

def test_auth_invalid_login(client):
    """Verify login fails with wrong password."""
    client.post("/api/auth/register", json={
        "username": "failuser",
        "password": "correct-pass"
    })
    
    response = client.post("/api/auth/login", json={
        "username": "failuser",
        "password": "wrong-pass"
    })
    assert response.status_code == 401
