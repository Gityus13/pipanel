import os
import shutil
import aiofiles
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()

ROOT = Path.home()


def safe_path(path: str) -> Path:
    """Resolve path and ensure it's within HOME."""
    p = (ROOT / path.lstrip("/")).resolve()
    if not str(p).startswith(str(ROOT)):
        raise HTTPException(status_code=403, detail="Access denied")
    return p


@router.get("/list")
async def list_dir(path: str = "/", auth=Depends(verify_token)):
    p = safe_path(path)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    if not p.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    items = []
    try:
        for entry in sorted(p.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
            stat = entry.stat(follow_symlinks=False)
            items.append({
                "name": entry.name,
                "path": str(entry.relative_to(ROOT)),
                "is_dir": entry.is_dir(),
                "size": stat.st_size if entry.is_file() else None,
                "modified": stat.st_mtime,
            })
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    return {
        "path": str(p.relative_to(ROOT)),
        "items": items,
    }


@router.get("/download")
async def download(path: str, auth=Depends(verify_token)):
    p = safe_path(path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(p, filename=p.name)


@router.post("/upload")
async def upload(path: str = "/", file: UploadFile = File(...), auth=Depends(verify_token)):
    dest = safe_path(path) / file.filename
    async with aiofiles.open(dest, "wb") as f:
        content = await file.read()
        await f.write(content)
    return {"ok": True, "path": str(dest.relative_to(ROOT))}


class RenameRequest(BaseModel):
    old_path: str
    new_name: str


@router.post("/rename")
async def rename(req: RenameRequest, auth=Depends(verify_token)):
    old = safe_path(req.old_path)
    new = old.parent / req.new_name
    old.rename(new)
    return {"ok": True}


class DeleteRequest(BaseModel):
    path: str


@router.post("/delete")
async def delete(req: DeleteRequest, auth=Depends(verify_token)):
    p = safe_path(req.path)
    if p.is_dir():
        shutil.rmtree(p)
    else:
        p.unlink()
    return {"ok": True}


class MkdirRequest(BaseModel):
    path: str
    name: str


@router.post("/mkdir")
async def mkdir(req: MkdirRequest, auth=Depends(verify_token)):
    p = safe_path(req.path) / req.name
    p.mkdir(parents=True, exist_ok=True)
    return {"ok": True}
