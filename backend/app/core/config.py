"""Application settings — loaded from environment / .env.

v2 changes vs v1:
  - JWTs are verified against the Supabase project JWKS (ES256, asymmetric).
    There is no shared HS256 secret in the backend anymore.
  - Tenant is NEVER trusted from a request header; it is derived from the
    JWT-validated membership (see app/api/deps.py).
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ─── Runtime ──────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    PORT: int = 8000

    # ─── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str
    DATABASE_URL_ASYNC: str = ""
    # Cloud (Supabase) connection for applying migrations / seeding.
    SUPABASE_DB_URL: str = ""
    # Non-superuser role used for request-scoped queries so RLS is enforced.
    DB_APP_ROLE: str = "app_user"

    # ─── Supabase ───────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_PROJECT_REF: str = ""
    SUPABASE_PUBLISHABLE_KEY: str = ""
    SUPABASE_SECRET_KEY: str = ""  # service-role; backend only
    SUPABASE_JWKS_URL: str = ""

    # ─── Integrations ───────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    # Model for the SAT-code suggester. Haiku is plenty for this simple
    # classification (~5x cheaper than Opus); override via env if ever needed.
    SAT_AI_MODEL: str = "claude-haiku-4-5"
    # Ambiente del PAC: sandbox (default) o producción (https://api.facturama.mx).
    FACTURAMA_BASE_URL: str = "https://apisandbox.facturama.mx"
    FACTURAMA_API_KEY: str = ""
    FACTURAMA_USER: str = ""
    FACTURAMA_PASSWORD: str = ""
    # Cancelación simulada: el sandbox de Facturama NO cancela (devuelve 500). Con
    # esto en true, cancelar_factura NO llama al PAC y solo aplica la lógica interna
    # (estado CANCELADA + efecto en inventario por motivo). En producción: false.
    FACTURAMA_FAKE_CANCEL: bool = False
    # Levanta el guard "solo sandbox" para permitir el host de producción
    # (api.facturama.mx). Mantener false hasta tener CSD/credenciales de producción.
    FACTURAMA_ALLOW_PRODUCTION: bool = False
    # Envía Serie/Folio propios al PAC. Facturama SOLO acepta series dadas de alta
    # en la cuenta/sucursal; activar solo cuando esas series existan en Facturama.
    FACTURAMA_SEND_SERIE: bool = False
    # Multi-emisor: cada tenant timbra con SU propio RFC/CSD (subido a la cuenta
    # maestra de Facturama). Con true, el emisor del CFDI se arma desde los datos
    # fiscales del tenant. En producción multi-empresa: true.
    FACTURAMA_MULTIEMISOR: bool = False
    # Emisor opcional (override GLOBAL de un solo emisor): si está vacío y
    # FACTURAMA_MULTIEMISOR=false, Facturama usa el CSD por defecto de la cuenta
    # (lo correcto en sandbox). En producción single-emisor, fíjalo al RFC real cuyo
    # CSD está cargado en Facturama.
    FACTURAMA_ISSUER_RFC: str = ""
    FACTURAMA_ISSUER_NAME: str = ""
    FACTURAMA_ISSUER_REGIMEN: str = ""
    FACTURAMA_EXPEDITION_PLACE: str = ""

    # ─── Cache ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ─── Signup público (anti-abuso) ────────────────────────────────────────────
    # Kill-switch: false deshabilita el registro autoservicio (POST /registro).
    SIGNUP_ENABLED: bool = True
    # Máximo de registros por IP por hora (rate limit con Redis; fail-open).
    SIGNUP_RATE_PER_HOUR: int = 5

    # ─── CORS (comma-separated) ─────────────────────────────────────────────────
    ALLOWED_ORIGINS: str = "http://localhost:3012,http://localhost:3000"

    # ─── Platform operator allowlist (comma-separated emails) ──────────────────
    PLATFORM_OPERATORS: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ─── Derived helpers ───────────────────────────────────────────────────────
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    def platform_operators_list(self) -> list[str]:
        return [e.strip().lower() for e in self.PLATFORM_OPERATORS.split(",") if e.strip()]

    def jwks_url(self) -> str:
        """JWKS endpoint; derived from SUPABASE_URL if not set explicitly."""
        if self.SUPABASE_JWKS_URL:
            return self.SUPABASE_JWKS_URL
        if self.SUPABASE_URL:
            return f"{self.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
        return ""

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in ("production", "prod")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
