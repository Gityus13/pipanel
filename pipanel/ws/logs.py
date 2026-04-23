import asyncio
import subprocess
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

router = APIRouter()


@router.websocket("/logs/{service}")
async def stream_logs(websocket: WebSocket, service: str, token: str = Query(...)):
    from pipanel.api.auth import _tokens
    from datetime import datetime
    if token not in _tokens or datetime.utcnow() > _tokens[token]:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    proc = subprocess.Popen(
        ["sudo", "journalctl", "-u", service, "-f", "-n", "50", "--output=short"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, bufsize=1
    )

    try:
        loop = asyncio.get_event_loop()
        while True:
            line = await loop.run_in_executor(None, proc.stdout.readline)
            if not line:
                break
            await websocket.send_text(line.rstrip())
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        proc.terminate()
