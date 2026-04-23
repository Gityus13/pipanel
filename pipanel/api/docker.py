import subprocess
import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()


def docker_available() -> bool:
    try:
        r = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return r.returncode == 0
    except Exception:
        return False


def run_docker(*args) -> tuple[int, str, str]:
    result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=30)
    return result.returncode, result.stdout, result.stderr


@router.get("/status")
async def docker_status(auth=Depends(verify_token)):
    return {"available": docker_available()}


@router.get("/containers")
async def list_containers(all: bool = True, auth=Depends(verify_token)):
    if not docker_available():
        raise HTTPException(status_code=503, detail="Docker not available")

    fmt = '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}","created":"{{.CreatedAt}}"}'
    code, out, err = run_docker("ps", "--format", fmt, *(["--all"] if all else []))

    containers = []
    for line in out.strip().splitlines():
        if line.strip():
            try:
                containers.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return {"containers": containers}


@router.get("/images")
async def list_images(auth=Depends(verify_token)):
    if not docker_available():
        raise HTTPException(status_code=503, detail="Docker not available")

    fmt = '{"id":"{{.ID}}","repository":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedAt}}"}'
    code, out, err = run_docker("images", "--format", fmt)

    images = []
    for line in out.strip().splitlines():
        if line.strip():
            try:
                images.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return {"images": images}


class ContainerAction(BaseModel):
    action: str  # start | stop | restart | remove | pause | unpause


@router.post("/{container_id}/action")
async def container_action(container_id: str, body: ContainerAction, auth=Depends(verify_token)):
    allowed = {"start", "stop", "restart", "remove", "pause", "unpause"}
    if body.action not in allowed:
        raise HTTPException(status_code=400, detail=f"Action must be one of {allowed}")

    docker_cmd = "rm" if body.action == "remove" else body.action
    code, out, err = run_docker(docker_cmd, container_id)
    if code != 0:
        raise HTTPException(status_code=500, detail=err or out)
    return {"ok": True, "action": body.action, "container": container_id}


@router.get("/{container_id}/logs")
async def container_logs(container_id: str, lines: int = 100, auth=Depends(verify_token)):
    if not docker_available():
        raise HTTPException(status_code=503, detail="Docker not available")
    code, out, err = run_docker("logs", "--tail", str(lines), container_id)
    return {"logs": out + err}
