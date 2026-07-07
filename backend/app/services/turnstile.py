"""Verificación de Cloudflare Turnstile (captcha) — config-gated.

Si `TURNSTILE_SECRET` está vacío, la verificación se OMITE (devuelve True): así el
captcha solo actúa en entornos donde el operador lo configuró (prod). En el front,
el widget se renderiza solo si hay NEXT_PUBLIC_TURNSTILE_SITE_KEY.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from ..core.config import settings

log = logging.getLogger(__name__)

_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def enabled() -> bool:
    return bool(settings.TURNSTILE_SECRET)


def verify(token: Optional[str], remote_ip: Optional[str] = None) -> bool:
    """True si el token es válido (o si Turnstile está desactivado)."""
    if not enabled():
        return True
    if not token:
        return False
    data = {"secret": settings.TURNSTILE_SECRET, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        r = httpx.post(_VERIFY_URL, data=data, timeout=10)
        return bool(r.json().get("success")) if r.status_code == 200 else False
    except Exception as exc:  # noqa: BLE001
        # Fail-CLOSED: si Turnstile está activado pero no responde, no dejamos pasar
        # (a diferencia del rate limit). Es una verificación anti-bot deliberada.
        log.warning("Turnstile no verificable (fail-closed): %s", exc)
        return False
