"""SmartSupply v2.0 — FastAPI entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .core.config import settings
from .api.v1 import (
    almacenes,
    auth,
    categorias,
    clientes,
    conversiones,
    esquemas_impuesto,
    inventario,
    listas_precios,
    ordenes_compra,
    productos,
    proveedores,
    remisiones,
    sat,
)

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "SmartSupply v2.0 starting — env=%s, origins=%s",
        settings.ENVIRONMENT,
        settings.allowed_origins_list(),
    )
    yield
    log.info("Shutting down")


app = FastAPI(
    title="SmartSupply v2.0",
    version=__version__,
    description="Plataforma SaaS multi-tenant — cadena de suministro gobierno-alimentos.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Request-Id", "X-Total-Count"],
    max_age=3600,
)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "version": __version__, "env": settings.ENVIRONMENT}


@app.get("/api", tags=["meta"])
def api_root() -> dict:
    return {"service": "smartsupply-v2", "docs": "/docs", "health": "/health"}


# ─── API v1 routers ───────────────────────────────────────────────────────────
app.include_router(auth.router, prefix="/api/v1")
# Phase 3 — catálogo / master data
app.include_router(categorias.router, prefix="/api/v1")
app.include_router(esquemas_impuesto.router, prefix="/api/v1")
app.include_router(productos.router, prefix="/api/v1")
app.include_router(listas_precios.router, prefix="/api/v1")
app.include_router(clientes.router, prefix="/api/v1")
# Phase 4 — operaciones
app.include_router(proveedores.router, prefix="/api/v1")
app.include_router(almacenes.router, prefix="/api/v1")
app.include_router(inventario.router, prefix="/api/v1")
app.include_router(ordenes_compra.router, prefix="/api/v1")
app.include_router(conversiones.router, prefix="/api/v1")
app.include_router(remisiones.router, prefix="/api/v1")
app.include_router(sat.router, prefix="/api/v1")
