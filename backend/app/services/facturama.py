"""Cliente HTTP para Facturama (PAC para timbrado CFDI 4.0) — SOLO SANDBOX.

Thin wrapper sobre la API de Facturama. Guard duro: rechaza cualquier base_url
que no sea el sandbox (`apisandbox.facturama.mx`), así nunca se timbra real.
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
    """Wrapper minimal: timbrar, cancelar, descargar PDF/XML. Solo sandbox."""

    def __init__(self, creds: Optional[FacturamaCredentials], timeout: float = 30.0):
        self._creds = creds
        self._timeout = timeout

    @classmethod
    def from_settings(cls, settings) -> "FacturamaClient":
        return cls(FacturamaCredentials.from_settings(settings))

    @property
    def configured(self) -> bool:
        return self._creds is not None

    def _client(self) -> httpx.Client:
        if not self._creds:
            raise FacturamaConfigError(
                "Facturama no configurado: define FACTURAMA_USER y FACTURAMA_PASSWORD en .env"
            )
        if _SANDBOX_HOST not in self._creds.base_url and not self._creds.allow_production:
            # Guard: por defecto solo sandbox. Para producción, FACTURAMA_ALLOW_PRODUCTION=true.
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

    # ─── CSD (sellos digitales) — multi-emisor / api-lite ─────────────────
    def subir_csd(
        self, rfc: str, certificate_b64: str, private_key_b64: str, password: str
    ) -> dict:
        """Sube el CSD del emisor a Facturama (multi-emisor).

        POST /api-lite/csds con el .cer y .key en base64 + contraseña de la
        llave privada. Levanta FacturamaError si la respuesta es >=400.
        """
        body = {
            "Rfc": rfc,
            "Certificate": certificate_b64,
            "PrivateKey": private_key_b64,
            "PrivateKeyPassword": password,
        }
        with self._client() as c:
            r = c.post("/api-lite/csds", json=body)
            if r.status_code >= 400:
                log.error("Facturama /api-lite/csds %s | RESPONSE=%s", r.status_code, r.text[:1000])
                raise FacturamaError(f"subir_csd failed: {r.status_code} {r.text[:500]}")
            return r.json()

    def listar_csds(self) -> list:
        """Lista los CSD cargados en Facturama. [] si error o no 200."""
        try:
            with self._client() as c:
                r = c.get("/api-lite/csds")
                if r.status_code != 200:
                    return []
                data = r.json()
                return data if isinstance(data, list) else []
        except (FacturamaError, Exception):  # noqa: BLE001 — listado tolerante
            return []

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
