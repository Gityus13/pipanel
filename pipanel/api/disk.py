import subprocess
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends
from pipanel.api.auth import verify_token

router = APIRouter()


@router.get("/usage")
async def disk_usage(path: str = "/", depth: int = 1, auth=Depends(verify_token)):
    """Return disk usage for top-level dirs at given path."""
    try:
        p = Path(path).resolve()
        result = subprocess.run(
            ["du", "-s", "--block-size=1", str(p / "*")],
            capture_output=True, text=True, shell=False
        )
        # Use glob approach instead
        entries = []
        try:
            for child in sorted(p.iterdir()):
                try:
                    r = subprocess.run(
                        ["du", "-s", "--block-size=1", str(child)],
                        capture_output=True, text=True, timeout=5
                    )
                    if r.returncode == 0:
                        size = int(r.stdout.split()[0])
                        entries.append({
                            "path": str(child),
                            "name": child.name,
                            "size": size,
                            "is_dir": child.is_dir(),
                        })
                except Exception:
                    pass
        except PermissionError:
            pass

        entries.sort(key=lambda x: x["size"], reverse=True)
        total = shutil.disk_usage(str(p))

        return {
            "path": str(p),
            "entries": entries[:30],
            "total": total.total,
            "used": total.used,
            "free": total.free,
        }
    except Exception as e:
        return {"error": str(e), "entries": [], "path": path}


@router.get("/mounts")
async def mounts(auth=Depends(verify_token)):
    """Return all mounted filesystems."""
    result = subprocess.run(
        ["df", "-h", "--output=source,fstype,size,used,avail,pcent,target"],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().splitlines()
    if len(lines) < 2:
        return {"mounts": []}

    mounts = []
    for line in lines[1:]:
        parts = line.split()
        if len(parts) >= 7:
            mounts.append({
                "source": parts[0],
                "fstype": parts[1],
                "size":   parts[2],
                "used":   parts[3],
                "avail":  parts[4],
                "percent": parts[5],
                "mount":  parts[6],
            })
    return {"mounts": mounts}
