# PROGRESO — feat/remisiones-facturas-ia

Rama: `feat/remisiones-facturas-ia`. Ver [PLAN-remisiones-facturas.md](PLAN-remisiones-facturas.md).
Backend dev corre contra Supabase cloud (ver memoria backend-db-runtime). Solo sandbox para facturas.

## Estado de migraciones cloud
- alembic head aplicado: `0024_producto_alias` ✅

## Hecho
- [x] **Series de folios** (cimiento): asignación cliente/sucursal, default, pareja factura+remisión, folio sin guion. (commit 72e7d1d)
- [x] **Cruce IA — backend**: tabla `producto_alias` + pg_trgm (mig 0024), `services/producto_match.py` (exacto→alias→difuso RapidFuzz→IA Claude), endpoints `POST /productos/match` y `POST /productos/alias`. Verificado live.

## En curso / pendiente
- [ ] Remisiones — frontend completo (lista, alta/edición con line entry + buscador + serie preview, confirmar/cancelar, imprimible)
- [ ] Pegar como Excel (grid) + combobox de búsqueda (componentes compartidos)
- [ ] Facturas — backend sandbox: portar `facturama.py` + `cfdi_builder.py` de v1, endpoints timbrar/cancelar/pdf/xml (creds sandbox de v1)
- [ ] Facturas — frontend (lista, generar desde remisiones, timbrar sandbox, ver XML/PDF, cancelar)
- [ ] Tests QA remisiones + facturas
- [ ] QA intenso plataforma + QA-REPORT.md + limpieza segura
- [ ] lint/tsc/build + PR

## Notas / deudas
- `rapidfuzz` faltaba en el venv local (estaba en requirements); instalado. CI ok.
- RBAC: `/productos/match` y `/alias` gated con `menu:productos`. Revisar que roles de remisión/factura tengan ese permiso (o aflojar). Anotado para QA.
- Archivos ajenos en working tree de otra sesión (compras/sistema-diseno/DataTable): NO incluir en mis commits.
