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
    FACTURAMA_BASE_URL: str = "https://apisandbox.facturama.mx"
    FACTURAMA_API_KEY: str = ""
    FACTURAMA_USER: str = ""
    FACTURAMA_PASSWORD: str = ""
    # Emisor opcional: si está vacío, Facturama usa el CSD por defecto de la cuenta
    # (lo correcto en sandbox, donde el RFC real del tenant no tiene CSD registrado).
    FACTURAMA_ISSUER_RFC: str = ""
    FACTURAMA_ISSUER_NAME: str = ""
    FACTURAMA_ISSUER_REGIMEN: str = ""
    FACTURAMA_EXPEDITION_PLACE: str = ""

    # ─── Cache ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

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
