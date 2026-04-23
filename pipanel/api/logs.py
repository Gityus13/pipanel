import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pipanel.api.auth import verify_token

router = APIRouter()

LOG_DIR = Path("/var/log")
SAFE_LOGS = [
    "syslog", "auth.log", "kern.log", "dmesg", "dpkg.log",
    "apt/history.log", "apt/term.log", "daemon.log", "messages",
    "user.log", "boot.log",
]


@router.get("/files")
async def list_logs(auth=Depends(verify_token)):
    logs = []
    for name in SAFE_LOGS:
        p = LOG_DIR / name
        if p.exists():
            stat = p.stat()
            logs.append({"name": name, "size": stat.st_size, "modified": stat.st_mtime})
    return {"logs": logs}


@router.get("/read")
async def read_log(name: str, lines: int = 200, auth=Depends(verify_token)):
    # Safety: only allow whitelisted logs
    if name not in SAFE_LOGS:
        raise HTTPException(status_code=403, detail="Log not allowed")
    p = LOG_DIR / name
    if not p.exists():
        raise HTTPException(status_code=404, detail="Log not found")
    result = subprocess.run(
        ["sudo", "tail", "-n", str(lines), str(p)],
        capture_output=True, text=True
    )
    return {"name": name, "content": result.stdout}


@router.get("/journal")
async def journal(lines: int = 200, unit: str = "", auth=Depends(verify_token)):
    cmd = ["sudo", "journalctl", "-n", str(lines), "--no-pager", "--output=short-precise"]
    if unit:
        cmd += ["-u", unit]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return {"content": result.stdout}


@router.get("/dmesg")
async def dmesg(lines: int = 100, auth=Depends(verify_token)):
    result = subprocess.run(
        ["sudo", "dmesg", "--human", "--decode", "-T"],
        capture_output=True, text=True
    )
    lines_out = result.stdout.strip().splitlines()
    return {"content": "\n".join(lines_out[-lines:])}
