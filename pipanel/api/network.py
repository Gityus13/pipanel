import subprocess
import socket
from fastapi import APIRouter, Depends
from pipanel.api.auth import verify_token

router = APIRouter()


def get_local_network() -> str:
    """Get local subnet e.g. 192.168.1.0/24"""
    try:
        result = subprocess.run(["ip", "route"], capture_output=True, text=True)
        for line in result.stdout.splitlines():
            if "src" in line and ("192.168" in line or "10." in line or "172." in line):
                parts = line.split()
                return parts[0]
    except Exception:
        pass
    return "192.168.1.0/24"


def arp_scan() -> list[dict]:
    """Use arp-scan or fall back to parsing /proc/net/arp."""
    devices = []
    try:
        result = subprocess.run(
            ["sudo", "arp-scan", "--localnet", "--quiet"],
            capture_output=True, text=True, timeout=30
        )
        for line in result.stdout.splitlines():
            parts = line.split("\t")
            if len(parts) >= 2 and parts[0].count(".") == 3:
                ip = parts[0].strip()
                mac = parts[1].strip()
                hostname = ""
                try:
                    hostname = socket.gethostbyaddr(ip)[0]
                except Exception:
                    pass
                devices.append({"ip": ip, "mac": mac, "hostname": hostname})
    except Exception:
        # Fallback: parse /proc/net/arp
        try:
            with open("/proc/net/arp") as f:
                lines = f.readlines()[1:]  # skip header
            for line in lines:
                parts = line.split()
                if len(parts) >= 4 and parts[2] != "0x0":
                    ip = parts[0]
                    mac = parts[3]
                    hostname = ""
                    try:
                        hostname = socket.gethostbyaddr(ip)[0]
                    except Exception:
                        pass
                    devices.append({"ip": ip, "mac": mac, "hostname": hostname})
        except Exception:
            pass
    return devices


@router.get("/devices")
async def devices(auth=Depends(verify_token)):
    return {"devices": arp_scan(), "subnet": get_local_network()}


@router.get("/ping")
async def ping(host: str, auth=Depends(verify_token)):
    result = subprocess.run(
        ["ping", "-c", "3", "-W", "1", host],
        capture_output=True, text=True
    )
    lines = result.stdout.strip().splitlines()
    return {
        "host": host,
        "reachable": result.returncode == 0,
        "output": "\n".join(lines),
    }
