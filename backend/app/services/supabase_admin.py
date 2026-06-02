"""Admin API de Supabase (service key, solo backend): crear usuarios de Auth y
cambiar contraseñas. Requiere SUPABASE_URL + SUPABASE_SECRET_KEY."""
from __future__ import annotations
from typing import Optional
import httpx
from ..core.config import settings


class SupabaseAdminError(Exception):
    pass


def configured() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SECRET_KEY)


def _headers() -> dict:
    key = settings.SUPABASE_SECRET_KEY
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _base() -> str:
    return settings.SUPABASE_URL.rstrip("/")


def create_auth_user(email: str, password: str, full_name: Optional[str] = None) -> str:
    body = {"email": email, "password": password, "email_confirm": True}
    if full_name:
        body["user_metadata"] = {"full_name": full_name}
    try:
        r = httpx.post(f"{_base()}/auth/v1/admin/users", json=body, headers=_headers(), timeout=20)
    except httpx.HTTPError as exc:
        raise SupabaseAdminError(f"conexión: {exc}")
    if r.status_code >= 400:
        raise SupabaseAdminError(f"{r.status_code} {r.text[:300]}")
    return r.json()["id"]


def set_password(auth_user_id: str, password: str) -> None:
    try:
        r = httpx.put(f"{_base()}/auth/v1/admin/users/{auth_user_id}", json={"password": password},
                      headers=_headers(), timeout=20)
    except httpx.HTTPError as exc:
        raise SupabaseAdminError(f"conexión: {exc}")
    if r.status_code >= 400:
        raise SupabaseAdminError(f"{r.status_code} {r.text[:300]}")


def delete_auth_user(auth_user_id: str) -> None:
    try:
        httpx.delete(f"{_base()}/auth/v1/admin/users/{auth_user_id}", headers=_headers(), timeout=20)
    except httpx.HTTPError:
        pass
