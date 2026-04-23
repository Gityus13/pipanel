import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".pipanel"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "host": "0.0.0.0",
    "port": 8080,
    "auth_enabled": True,
    "theme": "dark",
    "password_hash": "",
}


def get_config() -> dict:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        save_config(DEFAULTS)
        return DEFAULTS.copy()
    with open(CONFIG_FILE) as f:
        data = json.load(f)
    return {**DEFAULTS, **data}


def save_config(config: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
