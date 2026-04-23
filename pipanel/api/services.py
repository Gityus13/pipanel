import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()


def run_systemctl(*args) -> tuple[int, str, str]:
    result = subprocess.run(
        ["sudo", "systemctl", *args],
        capture_output=True, text=True
    )
    return result.returncode, result.stdout, result.stderr


def parse_service(name: str) -> dict:
    code, out, _ = run_systemctl("show", name,
        "--property=ActiveState,SubState,LoadState,Description,UnitFileState")
    props = {}
    for line in out.strip().splitlines():
        if "=" in line:
            k, v = line.split("=", 1)
            props[k] = v
    return {
        "name": name,
        "active": props.get("ActiveState", "unknown"),
        "sub": props.get("SubState", "unknown"),
        "load": props.get("LoadState", "unknown"),
        "enabled": props.get("UnitFileState", "unknown"),
        "description": props.get("Description", ""),
    }


@router.get("/")
async def list_services(auth=Depends(verify_token)):
    code, out, _ = run_systemctl("list-units", "--type=service",
                                  "--all", "--no-pager", "--plain", "--no-legend")
    services = []
    for line in out.strip().splitlines():
        parts = line.split()
        if parts:
            name = parts[0].replace(".service", "")
            services.append(parse_service(name + ".service"))
    return services


@router.get("/{name}")
async def get_service(name: str, auth=Depends(verify_token)):
    return parse_service(name)


class ServiceAction(BaseModel):
    action: str  # start | stop | restart | enable | disable


@router.post("/{name}/action")
async def service_action(name: str, body: ServiceAction, auth=Depends(verify_token)):
    allowed = {"start", "stop", "restart", "enable", "disable"}
    if body.action not in allowed:
        raise HTTPException(status_code=400, detail=f"Action must be one of {allowed}")
    code, out, err = run_systemctl(body.action, name)
    if code != 0:
        raise HTTPException(status_code=500, detail=err or out)
    return {"ok": True, "action": body.action, "service": name}


@router.get("/{name}/logs")
async def service_logs(name: str, lines: int = 100, auth=Depends(verify_token)):
    result = subprocess.run(
        ["sudo", "journalctl", "-u", name, "-n", str(lines), "--no-pager", "--output=short"],
        capture_output=True, text=True
    )
    return {"logs": result.stdout}
