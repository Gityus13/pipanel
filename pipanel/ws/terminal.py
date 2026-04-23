import asyncio
import os
import pty
import select
import termios
import struct
import fcntl
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

router = APIRouter()


@router.websocket("/terminal")
async def terminal(websocket: WebSocket, token: str = Query(...)):
    # Validate token
    from pipanel.api.auth import _tokens
    from datetime import datetime
    if token not in _tokens or datetime.utcnow() > _tokens[token]:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    # Fork a PTY
    master_fd, slave_fd = pty.openpty()
    pid = os.fork()

    if pid == 0:
        # Child: become the shell
        os.setsid()
        os.close(master_fd)
        fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        os.dup2(slave_fd, 0)
        os.dup2(slave_fd, 1)
        os.dup2(slave_fd, 2)
        os.close(slave_fd)
        shell = os.environ.get("SHELL", "/bin/bash")
        os.execv(shell, [shell])
        os._exit(1)

    os.close(slave_fd)

    async def read_from_pty():
        loop = asyncio.get_event_loop()
        while True:
            try:
                r, _, _ = select.select([master_fd], [], [], 0.05)
                if r:
                    data = os.read(master_fd, 4096)
                    if data:
                        await websocket.send_bytes(data)
                else:
                    await asyncio.sleep(0.01)
            except OSError:
                break

    try:
        read_task = asyncio.create_task(read_from_pty())
        while True:
            msg = await websocket.receive()
            if "bytes" in msg:
                data = msg["bytes"]
                # Handle resize message: b'\x01' + 2 bytes rows + 2 bytes cols
                if data[0:1] == b'\x01' and len(data) == 5:
                    rows = int.from_bytes(data[1:3], 'big')
                    cols = int.from_bytes(data[3:5], 'big')
                    winsize = struct.pack("HHHH", rows, cols, 0, 0)
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                else:
                    os.write(master_fd, data)
            elif "text" in msg:
                os.write(master_fd, msg["text"].encode())
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        read_task.cancel()
        try:
            os.kill(pid, 9)
            os.waitpid(pid, 0)
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass
