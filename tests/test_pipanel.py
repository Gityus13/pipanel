"""Tests for PiPanel — run on any Linux machine (no Pi required)."""

import json
import hashlib
import pytest
from pathlib import Path
from fastapi.testclient import TestClient

# ── Config tests ──────────────────────────────────────
def test_config_defaults(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from pipanel import config as cfg
    importlib_reload(cfg)
    result = cfg.get_config()
    assert result["port"] == 8080
    assert result["auth_enabled"] is True
    assert result["theme"] == "dark"


def test_config_save_load(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    from pipanel import config as cfg
    importlib_reload(cfg)
    cfg.save_config({"port": 9090, "theme": "light", "auth_enabled": False, "password_hash": "abc"})
    loaded = cfg.get_config()
    assert loaded["port"] == 9090
    assert loaded["theme"] == "light"


# ── Auth tests ────────────────────────────────────────
def make_client(tmp_path, monkeypatch, password="testpass"):
    monkeypatch.setenv("HOME", str(tmp_path))
    from pipanel import config as cfg
    importlib_reload(cfg)
    pw_hash = hashlib.sha256(password.encode()).hexdigest()
    cfg.save_config({
        "port": 8080, "host": "0.0.0.0",
        "auth_enabled": True, "theme": "dark",
        "password_hash": pw_hash,
    })
    from pipanel.main import app
    return TestClient(app)


def test_login_success(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    res = client.post("/api/auth/login", json={"password": "testpass"})
    assert res.status_code == 200
    assert "token" in res.json()


def test_login_failure(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    res = client.post("/api/auth/login", json={"password": "wrongpass"})
    assert res.status_code == 401


def test_protected_endpoint_no_token(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    res = client.get("/api/system/stats")
    assert res.status_code == 403


def test_protected_endpoint_with_token(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    login = client.post("/api/auth/login", json={"password": "testpass"})
    tok = login.json()["token"]
    res = client.get("/api/system/stats", headers={"Authorization": f"Bearer {tok}"})
    # Will succeed or fail based on psutil availability, but not 401/403
    assert res.status_code in (200, 500)


# ── System tests ──────────────────────────────────────
def test_system_stats_shape(tmp_path, monkeypatch):
    client = make_client(tmp_path, monkeypatch)
    tok = client.post("/api/auth/login", json={"password": "testpass"}).json()["token"]
    res = client.get("/api/system/stats", headers={"Authorization": f"Bearer {tok}"})
    if res.status_code == 200:
        data = res.json()
        assert "cpu" in data
        assert "memory" in data
        assert "disk" in data
        assert "uptime" in data


# ── File manager tests ────────────────────────────────
def test_file_list(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    # Create a dummy file
    (tmp_path / "hello.txt").write_text("hello")

    client = make_client(tmp_path, monkeypatch)
    tok = client.post("/api/auth/login", json={"password": "testpass"}).json()["token"]
    res = client.get("/api/files/list?path=/", headers={"Authorization": f"Bearer {tok}"})
    assert res.status_code == 200
    names = [i["name"] for i in res.json()["items"]]
    assert "hello.txt" in names


def test_file_path_traversal_blocked(tmp_path, monkeypatch):
    monkeypatch.setenv("HOME", str(tmp_path))
    client = make_client(tmp_path, monkeypatch)
    tok = client.post("/api/auth/login", json={"password": "testpass"}).json()["token"]
    res = client.get("/api/files/list?path=/../../../etc", headers={"Authorization": f"Bearer {tok}"})
    # Should be forbidden or return home-scoped path
    assert res.status_code in (403, 200)
    if res.status_code == 200:
        # Must not have escaped home
        assert "/etc" not in res.json().get("path", "")


# ── Helpers ───────────────────────────────────────────
import importlib

def importlib_reload(mod):
    importlib.reload(mod)
