import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pipanel.config import get_config

router = APIRouter()
security = HTTPBearer(auto_error=False)

# In-memory token store (sufficient for single-user Pi dashboard)
_tokens: dict[str, datetime] = {}
TOKEN_TTL_HOURS = 24


class LoginRequest(BaseModel):
    password: str


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)) -> bool:
    config = get_config()
    if not config.get("auth_enabled"):
        return True
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = credentials.credentials
    expiry = _tokens.get(token)
    if not expiry or datetime.utcnow() > expiry:
        _tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Token expired or invalid")
    return True


@router.post("/login")
async def login(req: LoginRequest):
    config = get_config()
    expected = config.get("password_hash", "")
    if hash_password(req.password) != expected:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_hex(32)
    _tokens[token] = datetime.utcnow() + timedelta(hours=TOKEN_TTL_HOURS)
    return {"token": token}


@router.post("/logout")
async def logout(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials:
        _tokens.pop(credentials.credentials, None)
    return {"ok": True}


@router.get("/check")
async def check(auth=Depends(verify_token)):
    return {"authenticated": True}
