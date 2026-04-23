import asyncio
import time
import psutil
import subprocess
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

router = APIRouter()

# Shared in-memory ring buffer — last 120 readings (10 min at 5s interval)
MAX_HISTORY = 120
_history: list[dict] = []


def get_cpu_temp() -> float:
    try:
        raw = open("/sys/class/thermal/thermal_zone0/temp").read().strip()
        return round(int(raw) / 1000, 1)
    except Exception:
        return 0.0


def snapshot() -> dict:
    cpu = psutil.cpu_percent(interval=0)
    vm = psutil.virtual_memory()
    return {
        "t": int(time.time()),
        "cpu": cpu,
        "mem": vm.percent,
        "temp": get_cpu_temp(),
    }


@router.websocket("/history")
async def history_stream(websocket: WebSocket, token: str = Query(...)):
    from pipanel.api.auth import _tokens
    from datetime import datetime
    import json

    if token not in _tokens or datetime.utcnow() > _tokens[token]:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # Send existing history immediately
    await websocket.send_text(json.dumps({"type": "history", "data": _history}))

    try:
        while True:
            await asyncio.sleep(5)
            point = snapshot()
            _history.append(point)
            if len(_history) > MAX_HISTORY:
                _history.pop(0)
            await websocket.send_text(json.dumps({"type": "point", "data": point}))
    except (WebSocketDisconnect, Exception):
        pass
