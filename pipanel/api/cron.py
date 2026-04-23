import subprocess
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()


def get_crontab() -> list[dict]:
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if result.returncode != 0:
        return []
    jobs = []
    for i, line in enumerate(result.stdout.splitlines()):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 5)
        if len(parts) >= 6:
            jobs.append({
                "id": i,
                "minute":  parts[0],
                "hour":    parts[1],
                "day":     parts[2],
                "month":   parts[3],
                "weekday": parts[4],
                "command": parts[5],
                "raw":     line,
            })
        elif len(parts) >= 2 and parts[0].startswith("@"):
            jobs.append({
                "id": i,
                "minute": parts[0],
                "hour": "", "day": "", "month": "", "weekday": "",
                "command": " ".join(parts[1:]),
                "raw": line,
            })
    return jobs


def write_crontab(lines: list[str]):
    content = "\n".join(lines) + "\n"
    proc = subprocess.run(["crontab", "-"], input=content, text=True, capture_output=True)
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=proc.stderr)


@router.get("/")
async def list_cron(auth=Depends(verify_token)):
    return {"jobs": get_crontab()}


class CronJob(BaseModel):
    minute:  str = "*"
    hour:    str = "*"
    day:     str = "*"
    month:   str = "*"
    weekday: str = "*"
    command: str


@router.post("/add")
async def add_cron(job: CronJob, auth=Depends(verify_token)):
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    existing = result.stdout.splitlines() if result.returncode == 0 else []
    new_line = f"{job.minute} {job.hour} {job.day} {job.month} {job.weekday} {job.command}"
    write_crontab(existing + [new_line])
    return {"ok": True}


class DeleteCron(BaseModel):
    raw: str  # exact line to remove


@router.post("/delete")
async def delete_cron(body: DeleteCron, auth=Depends(verify_token)):
    result = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(status_code=400, detail="No crontab found")
    lines = [l for l in result.stdout.splitlines() if l.strip() != body.raw.strip()]
    write_crontab(lines)
    return {"ok": True}
