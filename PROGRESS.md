# PROGRESO — feat/remisiones-facturas-ia

Rama: `feat/remisiones-facturas-ia`. Ver [PLAN-remisiones-facturas.md](PLAN-remisiones-facturas.md).
Backend dev corre contra Supabase cloud. Solo sandbox para facturas. Tests corren contra docker local 5434.

## Migraciones cloud aplicadas: head = `0025_factura_cancelacion`

## Hecho ✅
- [x] Series de folios (cimiento) — commit 72e7d1d
- [x] Cruce IA backend — producto_alias + match (exacto/alias/difuso/IA) — 77d2374
- [x] Remisiones frontend — alta+líneas+cruce+cotización+pegar Excel+confirmar/cancelar — 6fb5464
- [x] Facturas backend sandbox — Facturama + cfdi builder + timbrar/cancelar/pdf/xml — (commit facturas backend)
- [x] Facturas frontend — generar desde remisiones, timbrar, pdf/xml, cancelar
- [x] Tests QA remisiones/facturas/cruce + fixes. **Timbrado sandbox verificado E2E (UUID real).**
- [x] Bug crítico arreglado: resolución de serie había borrado carga de productos/esquemas en facturas.

## Suite: 131 passed, 1 skipped (contra 5434).

## Completado ✅
- [x] **Fase 6 — QA intenso**: dead code, RLS/RBAC, frontend → QA-REPORT.md + limpieza segura aplicada
- [x] lint/tsc/build verdes + rama pusheada + **PR #1 abierto**: https://github.com/frutaskelly/smartsupply_v2.0/pull/1

## TODO COMPLETO. Entregado en PR #1 para revisión.

## Notas / config / deudas
- `.env` (no commiteado) ahora tiene FACTURAMA_USER/PASSWORD (de v1) + FACTURAMA_EXPEDITION_PLACE=78390 (CP del perfil sandbox).
- **Para timbrar con NUESTRA serie en sandbox**: registrar las series (A, R, …) en el Perfil Fiscal de la cuenta Facturama sandbox (config de cuenta). El pipeline ya quedó probado: timbró un CFDI real sin serie (público general / global).
- `rapidfuzz` faltaba en venv local (estaba en requirements); instalado.
- RBAC: `/productos/match` y `/alias` gated con `menu:productos`. Verificar que roles de remisión/factura lo tengan.
- Archivos ajenos de otra sesión (compras/sistema-diseno/DataTable): fuera de mis commits.
