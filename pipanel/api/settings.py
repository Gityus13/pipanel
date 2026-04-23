import hashlib
import subprocess
import platform
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token
from pipanel.config import get_config, save_config

router = APIRouter()


@router.get("/info")
async def system_info(auth=Depends(verify_token)):
    """Return Pi hardware and OS info."""
    def read(path):
        try:
            return open(path).read().strip()
        except Exception:
            return ""

    model = read("/proc/device-tree/model") or read("/sys/firmware/devicetree/base/model") or "Unknown"
    serial = read("/proc/device-tree/serial-number") or ""
    os_info = read("/etc/os-release")
    os_name = ""
    for line in os_info.splitlines():
        if line.startswith("PRETTY_NAME="):
            os_name = line.split("=", 1)[1].strip('"')
            break

    # Firmware version
    fw = ""
    try:
        r = subprocess.run(["vcgencmd", "version"], capture_output=True, text=True)
        fw = r.stdout.strip()
    except Exception:
        pass

    # Python version
    py = platform.python_version()

    return {
        "model": model.replace("\x00", ""),
        "serial": serial.replace("\x00", ""),
        "os": os_name,
        "hostname": platform.node(),
        "firmware": fw,
        "python": py,
        "arch": platform.machine(),
        "kernel": platform.release(),
    }


@router.get("/config")
async def get_cfg(auth=Depends(verify_token)):
    cfg = get_config()
    # Never return password hash to frontend
    cfg.pop("password_hash", None)
    return cfg


class UpdateConfig(BaseModel):
    port: int | None = None
    theme: str | None = None
    host: str | None = None


@router.post("/config")
async def update_cfg(body: UpdateConfig, auth=Depends(verify_token)):
    cfg = get_config()
    if body.port is not None:
        if not (1024 <= body.port <= 65535):
            raise HTTPException(status_code=400, detail="Port must be 1024–65535")
        cfg["port"] = body.port
    if body.theme in ("dark", "light"):
        cfg["theme"] = body.theme
    if body.host is not None:
        cfg["host"] = body.host
    save_config(cfg)
    return {"ok": True}


class ChangePassword(BaseModel):
    old_password: str
    new_password: str


@router.post("/change-password")
async def change_password(body: ChangePassword, auth=Depends(verify_token)):
    cfg = get_config()
    if hashlib.sha256(body.old_password.encode()).hexdigest() != cfg.get("password_hash", ""):
        raise HTTPException(status_code=401, detail="Current password incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    cfg["password_hash"] = hashlib.sha256(body.new_password.encode()).hexdigest()
    save_config(cfg)
    return {"ok": True}


class QuickAction(BaseModel):
    action: str


@router.post("/quick-action")
async def quick_action(body: QuickAction, auth=Depends(verify_token)):
    actions = {
        "clear_cache":    ["sudo", "sync"],
        "drop_caches":    ["sudo", "sh", "-c", "echo 3 > /proc/sys/vm/drop_caches"],
        "apt_autoremove": ["sudo", "apt", "autoremove", "-y"],
        "apt_clean":      ["sudo", "apt", "clean"],
        "usb_devices":    ["lsusb"],
        "check_disk":     ["sudo", "fsck", "-n", "/"],
    }
    if body.action not in actions:
        raise HTTPException(status_code=400, detail=f"Unknown action: {body.action}")
    result = subprocess.run(actions[body.action], capture_output=True, text=True, timeout=60)
    return {
        "ok": result.returncode == 0,
        "output": result.stdout + result.stderr,
    }


@router.get("/usb")
async def usb_devices(auth=Depends(verify_token)):
    result = subprocess.run(["lsusb"], capture_output=True, text=True)
    devices = []
    for line in result.stdout.strip().splitlines():
        # Format: Bus 001 Device 002: ID 045e:0820 Microsoft Corp. ...
        parts = line.split(":", 2)
        if len(parts) >= 3:
            bus_dev = parts[0].strip() + ":" + parts[1].strip()
            desc = parts[2].strip()
            devices.append({"bus_device": bus_dev, "description": desc})
    return {"devices": devices}
