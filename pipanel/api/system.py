import psutil
import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends
from pipanel.api.auth import verify_token

router = APIRouter()


def _read_file(path: str) -> str:
    try:
        return Path(path).read_text().strip()
    except Exception:
        return ""


def get_cpu_temp() -> float:
    """Read Pi CPU temperature."""
    raw = _read_file("/sys/class/thermal/thermal_zone0/temp")
    return round(int(raw) / 1000, 1) if raw else 0.0


def get_gpu_temp() -> float:
    """Read Pi GPU temperature via vcgencmd."""
    try:
        out = subprocess.check_output(["vcgencmd", "measure_temp"], text=True)
        return float(out.strip().replace("temp=", "").replace("'C", ""))
    except Exception:
        return 0.0


def get_throttle_state() -> dict:
    """Decode vcgencmd get_throttled flags."""
    try:
        out = subprocess.check_output(["vcgencmd", "get_throttled"], text=True)
        val = int(out.strip().split("=")[1], 16)
        return {
            "raw": hex(val),
            "under_voltage": bool(val & 0x1),
            "arm_frequency_capped": bool(val & 0x2),
            "currently_throttled": bool(val & 0x4),
            "soft_temp_limit": bool(val & 0x8),
            "under_voltage_occurred": bool(val & 0x10000),
            "arm_frequency_capped_occurred": bool(val & 0x20000),
            "throttling_occurred": bool(val & 0x40000),
            "soft_temp_limit_occurred": bool(val & 0x80000),
        }
    except Exception:
        return {}


def get_uptime() -> str:
    """Return human-readable uptime."""
    raw = _read_file("/proc/uptime")
    if not raw:
        return "unknown"
    seconds = int(float(raw.split()[0]))
    days, r = divmod(seconds, 86400)
    hours, r = divmod(r, 3600)
    minutes = r // 60
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{minutes}m")
    return " ".join(parts)


@router.get("/stats")
async def stats(auth=Depends(verify_token)):
    cpu_freq = psutil.cpu_freq()
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    net = psutil.net_io_counters()

    return {
        "cpu": {
            "percent": psutil.cpu_percent(interval=0.2),
            "count": psutil.cpu_count(),
            "freq_mhz": round(cpu_freq.current) if cpu_freq else 0,
            "freq_max_mhz": round(cpu_freq.max) if cpu_freq else 0,
            "temp_c": get_cpu_temp(),
        },
        "gpu": {
            "temp_c": get_gpu_temp(),
        },
        "memory": {
            "total_mb": round(vm.total / 1024 / 1024),
            "used_mb": round(vm.used / 1024 / 1024),
            "percent": vm.percent,
        },
        "disk": {
            "total_gb": round(disk.total / 1024 ** 3, 1),
            "used_gb": round(disk.used / 1024 ** 3, 1),
            "percent": disk.percent,
        },
        "network": {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
        },
        "throttle": get_throttle_state(),
        "uptime": get_uptime(),
        "load_avg": list(psutil.getloadavg()),
    }


@router.get("/processes")
async def processes(auth=Depends(verify_token)):
    procs = []
    for p in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "status"]):
        try:
            procs.append(p.info)
        except psutil.NoSuchProcess:
            pass
    return sorted(procs, key=lambda x: x["cpu_percent"] or 0, reverse=True)[:50]
