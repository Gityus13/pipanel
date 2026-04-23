import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pipanel.api.auth import verify_token

router = APIRouter()


@router.get("/upgradable")
async def upgradable(auth=Depends(verify_token)):
    result = subprocess.run(
        ["apt", "list", "--upgradable", "--no-all-versions"],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().splitlines()
    packages = []
    for line in lines:
        if "/" in line and "upgradable" in line:
            parts = line.split()
            name = parts[0].split("/")[0]
            version = parts[1] if len(parts) > 1 else ""
            packages.append({"name": name, "version": version})
    return {"packages": packages, "count": len(packages)}


@router.post("/update-index")
async def update_index(auth=Depends(verify_token)):
    result = subprocess.run(
        ["sudo", "apt", "update"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"ok": True}


@router.post("/upgrade-all")
async def upgrade_all(auth=Depends(verify_token)):
    result = subprocess.run(
        ["sudo", "apt", "upgrade", "-y"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    return {"ok": True, "output": result.stdout}
