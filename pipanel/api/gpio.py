from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pipanel.api.auth import verify_token

router = APIRouter()

# Pi 5 GPIO pin info (BCM numbering)
GPIO_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
             16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]


def get_gpio_handle():
    try:
        import lgpio
        h = lgpio.gpiochip_open(4)  # Pi 5 uses gpiochip4
        return lgpio, h
    except Exception:
        return None, None


@router.get("/pins")
async def get_pins(auth=Depends(verify_token)):
    lgpio, h = get_gpio_handle()
    pins = []

    for pin in GPIO_PINS:
        pin_data = {
            "bcm": pin,
            "mode": "unknown",
            "value": None,
        }
        if lgpio and h is not None:
            try:
                lgpio.gpio_claim_input(h, pin)
                pin_data["mode"] = "input"
                pin_data["value"] = lgpio.gpio_read(h, pin)
            except Exception:
                pin_data["mode"] = "unavailable"
        pins.append(pin_data)

    if lgpio and h is not None:
        try:
            lgpio.gpiochip_close(h)
        except Exception:
            pass

    return {"pins": pins}


class GPIOWrite(BaseModel):
    pin: int
    value: int  # 0 or 1


@router.post("/write")
async def write_pin(req: GPIOWrite, auth=Depends(verify_token)):
    if req.pin not in GPIO_PINS:
        raise HTTPException(status_code=400, detail="Invalid pin")
    if req.value not in (0, 1):
        raise HTTPException(status_code=400, detail="Value must be 0 or 1")

    lgpio, h = get_gpio_handle()
    if not lgpio or h is None:
        raise HTTPException(status_code=503, detail="GPIO not available")

    try:
        lgpio.gpio_claim_output(h, req.pin)
        lgpio.gpio_write(h, req.pin, req.value)
        return {"ok": True, "pin": req.pin, "value": req.value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        lgpio.gpiochip_close(h)
