import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()


class PowerAction(BaseModel):
    action: str   # shutdown | reboot | suspend
    delay: int = 0  # seconds delay


@router.post("/action")
async def power_action(body: PowerAction, auth=Depends(verify_token)):
    allowed = {"shutdown", "reboot", "suspend"}
    if body.action not in allowed:
        raise HTTPException(status_code=400, detail=f"Action must be one of {allowed}")

    if body.action == "shutdown":
        cmd = ["sudo", "shutdown", "-h", f"+{body.delay // 60}" if body.delay >= 60 else "now"]
    elif body.action == "reboot":
        cmd = ["sudo", "shutdown", "-r", f"+{body.delay // 60}" if body.delay >= 60 else "now"]
    elif body.action == "suspend":
        cmd = ["sudo", "systemctl", "suspend"]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"ok": True, "action": body.action}


@router.post("/cancel")
async def cancel_shutdown(auth=Depends(verify_token)):
    result = subprocess.run(["sudo", "shutdown", "-c"], capture_output=True, text=True)
    return {"ok": True}
