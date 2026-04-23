"""
PiPanel — Raspberry Pi 5 Web Dashboard
https://github.com/Gityus13/pipanel
"""

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path

from pipanel.api import system, services, files, packages, network, gpio
from pipanel.api import auth, power, docker, cron, disk, logs, settings
from pipanel.ws import terminal, logs as ws_logs, history
from pipanel.config import get_config

app = FastAPI(
    title="PiPanel",
    description="Raspberry Pi 5 Web Dashboard",
    version="1.1.0",
    docs_url=None,
    redoc_url=None,
)

# ── API Routers ───────────────────────────────
app.include_router(auth.router,     prefix="/api/auth",     tags=["auth"])
app.include_router(system.router,   prefix="/api/system",   tags=["system"])
app.include_router(services.router, prefix="/api/services", tags=["services"])
app.include_router(files.router,    prefix="/api/files",    tags=["files"])
app.include_router(packages.router, prefix="/api/packages", tags=["packages"])
app.include_router(network.router,  prefix="/api/network",  tags=["network"])
app.include_router(gpio.router,     prefix="/api/gpio",     tags=["gpio"])
app.include_router(power.router,    prefix="/api/power",    tags=["power"])
app.include_router(docker.router,   prefix="/api/docker",   tags=["docker"])
app.include_router(cron.router,     prefix="/api/cron",     tags=["cron"])
app.include_router(disk.router,     prefix="/api/disk",     tags=["disk"])
app.include_router(logs.router,     prefix="/api/logs",     tags=["logs"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])

# ── WebSocket ─────────────────────────────────
app.include_router(terminal.router, prefix="/ws", tags=["websocket"])
app.include_router(ws_logs.router,  prefix="/ws", tags=["websocket"])
app.include_router(history.router,  prefix="/ws", tags=["websocket"])

# ── Static Frontend ───────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_spa(full_path: str):
    """Serve the SPA for all non-API routes."""
    return FileResponse(STATIC_DIR / "index.html")


def main():
    config = get_config()
    uvicorn.run(
        "pipanel.main:app",
        host=config.get("host", "0.0.0.0"),
        port=config.get("port", 8080),
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
