"""Cliente HTTP para Facturama (PAC para timbrado CFDI 4.0).

Thin wrapper sobre la API de Facturama. El ambiente lo decide `FACTURAMA_BASE_URL`:
  - sandbox  → https://apisandbox.facturama.mx  (default, timbres de prueba)
  - producción → https://api.facturama.mx       (timbres REALES ante el SAT)

Guard duro: para apuntar a un host que NO sea el sandbox se exige además
`FACTURAMA_ALLOW_PRODUCTION=true`. Así nunca se timbra real "por accidente":
hace falta cambiar la URL **y** levantar el flag de forma explícita.

Si no hay credenciales (FACTURAMA_USER / FACTURAMA_PASSWORD) los métodos
levantan `FacturamaConfigError` al ejecutar (modo stub para CI/tests offline).

Uso:
    client = FacturamaClient.from_settings(settings)
    if client.configured:
        result = client.create_cfdi(payload)
"""
from __future__ import annotations

import base64
import json as _json
import logging
from dataclasses import dataclass
from typing import Optional

import httpx

log = logging.getLogger(__name__)

_SANDBOX_HOST = "apisandbox.facturama.mx"


class FacturamaError(Exception):
    pass


class FacturamaConfigError(FacturamaError):
    pass


@dataclass
class FacturamaCredentials:
    user: str
    password: str
    base_url: str = "https://apisandbox.facturama.mx"
    allow_production: bool = False

    @classmethod
    def from_settings(cls, settings) -> Optional["FacturamaCredentials"]:
        u = getattr(settings, "FACTURAMA_USER", None)
        p = getattr(settings, "FACTURAMA_PASSWORD", None)
        url = getattr(settings, "FACTURAMA_BASE_URL", "https://apisandbox.facturama.mx")
        allow_prod = bool(getattr(settings, "FACTURAMA_ALLOW_PRODUCTION", False))
        if not u or not p:
            return None
        return cls(user=u, password=p, base_url=url.rstrip("/"), allow_production=allow_prod)


class FacturamaClient:
    """Wrapper minimal: timbrar, cancelar, descargar PDF/XML (sandbox o producción)."""

    def __init__(self, creds: Optional[FacturamaCredentials], timeout: float = 30.0):
        self._creds = creds
        self._timeout = timeout

    @classmethod
    def from_settings(cls, settings) -> "FacturamaClient":
        return cls(FacturamaCredentials.from_settings(settings))

    @property
    def configured(self) -> bool:
        return self._creds is not None

    @property
    def is_sandbox(self) -> bool:
        """True si apunta al host de pruebas (o si no hay credenciales)."""
        return not self._creds or _SANDBOX_HOST in self._creds.base_url

    @property
    def is_production(self) -> bool:
        return not self.is_sandbox

    @property
    def env_label(self) -> str:
        return "sandbox" if self.is_sandbox else "producción"

    def _client(self) -> httpx.Client:
        if not self._creds:
            raise FacturamaConfigError(
                "Facturama no configurado: define FACTURAMA_USER y FACTURAMA_PASSWORD en .env"
            )
        if _SANDBOX_HOST not in self._creds.base_url and not self._creds.allow_production:
            # Guard: apuntar fuera del sandbox exige el flag explícito de producción.
            raise FacturamaError(
                f"Timbrado bloqueado: FACTURAMA_BASE_URL no es sandbox ({_SANDBOX_HOST}). "
                f"Para producción define FACTURAMA_ALLOW_PRODUCTION=true."
            )
        return httpx.Client(
            base_url=self._creds.base_url,
            auth=(self._creds.user, self._creds.password),
            timeout=self._timeout,
            headers={"Content-Type": "application/json"},
        )

    # ─── CFDI 4.0 ──────────────────────────────────────────────────────────
    def create_cfdi(self, payload: dict) -> dict:
        with self._client() as c:
            r = c.post("/3/cfdis", json=payload)
            if r.status_code >= 400:
                log.error(
                    "Facturama /3/cfdis %s | PAYLOAD=%s | RESPONSE=%s",
                    r.status_code, _json.dumps(payload, default=str)[:2000], r.text[:1000],
                )
                raise FacturamaError(f"create_cfdi failed: {r.status_code} {r.text}")
            return r.json()

    def cancel_cfdi(self, cfdi_id: str, motive: str, uuid_replacement: Optional[str] = None) -> dict:
        params = {"type": "issued", "motive": motive}
        if uuid_replacement:
            params["uuidReplacement"] = uuid_replacement
        with self._client() as c:
            r = c.delete(f"/cfdi/{cfdi_id}", params=params)
            if r.status_code >= 400:
                raise FacturamaError(f"cancel_cfdi failed: {r.status_code} {r.text}")
            return r.json() if r.text else {}

    # ─── Validación de RFC en el SAT ──────────────────────────────────────
    def validar_rfc(self, rfc: str) -> dict:
        """Consulta el estado de un RFC en el SAT vía Facturama.

        GET /customers/status?rfc=... → {Rfc, FormatoCorrecto, Activo, Localizado}
        (más campos como la lista 69-B si aplican, que se pasan tal cual).
        Consume 1 folio de Facturama por llamada (es un botón manual).
        """
        with self._client() as c:
            r = c.get("/customers/status", params={"rfc": rfc})
            if r.status_code >= 400:
                raise FacturamaError(f"validar_rfc failed: {r.status_code} {r.text[:500]}")
            return r.json()

    def download_pdf(self, cfdi_id: str) -> bytes:
        with self._client() as c:
            r = c.get(f"/cfdi/pdf/issued/{cfdi_id}")
            if r.status_code >= 400:
                raise FacturamaError(f"download_pdf failed: {r.status_code} {r.text[:200]}")
            return base64.b64decode(r.json().get("Content", ""))

    def download_xml(self, cfdi_id: str) -> bytes:
        with self._client() as c:
            r = c.get(f"/cfdi/xml/issued/{cfdi_id}")
            if r.status_code >= 400:
                raise FacturamaError(f"download_xml failed: {r.status_code} {r.text[:200]}")
            return base64.b64decode(r.json().get("Content", ""))


def startup_warnings(settings) -> list[str]:
    """Inconsistencias de configuración de Facturama detectables al arranque.

    No lanza excepciones (el guard real vive en _client()); solo devuelve avisos
    para registrarlos en el log y hacer visible una configuración peligrosa antes
    de timbrar — sobre todo combinaciones de producción mal puestas.
    """
    base_url = getattr(settings, "FACTURAMA_BASE_URL", "") or ""
    is_prod = _SANDBOX_HOST not in base_url
    allow_prod = bool(getattr(settings, "FACTURAMA_ALLOW_PRODUCTION", False))
    fake_cancel = bool(getattr(settings, "FACTURAMA_FAKE_CANCEL", False))
    has_creds = bool(getattr(settings, "FACTURAMA_USER", "")) and bool(
        getattr(settings, "FACTURAMA_PASSWORD", "")
    )

    warnings: list[str] = []
    if is_prod and not allow_prod:
        warnings.append(
            "FACTURAMA_BASE_URL apunta a PRODUCCIÓN pero FACTURAMA_ALLOW_PRODUCTION=false: "
            "el timbrado quedará BLOQUEADO hasta poner el flag en true."
        )
    if is_prod and fake_cancel:
        warnings.append(
            "PRODUCCIÓN con FACTURAMA_FAKE_CANCEL=true: las cancelaciones NO se "
            "enviarán al SAT (el CFDI seguirá vigente ante el SAT aunque la app lo "
            "marque CANCELADA). Pon FACTURAMA_FAKE_CANCEL=false en producción."
        )
    if is_prod and not getattr(settings, "FACTURAMA_ISSUER_RFC", ""):
        warnings.append(
            "PRODUCCIÓN sin FACTURAMA_ISSUER_RFC: se usará el CSD por defecto de la "
            "cuenta Facturama. Verifica que sea el emisor correcto."
        )
    if is_prod and allow_prod and not has_creds:
        warnings.append(
            "PRODUCCIÓN habilitada pero faltan FACTURAMA_USER / FACTURAMA_PASSWORD."
        )
    return warnings
