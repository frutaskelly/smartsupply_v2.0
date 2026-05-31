# QA Report — SmartSupply v2.0 (rama `feat/remisiones-facturas-ia`)

Fecha: 2026-06-01. QA intenso de plataforma + módulos nuevos (remisiones, facturas, cruce IA).
Método: suite de tests (contra docker local 5434), `ruff`, `next build`/`tsc`, y 3 auditorías
paralelas (código muerto, seguridad RLS/RBAC, frontend).

## Resumen ejecutivo
- **Tests backend: 131 passed, 1 skipped.** `next build` ✅, `tsc --noEmit` ✅, `ruff --select F` ✅.
- **RLS: 100% de cobertura.** Toda tabla con `tenant_id` tiene política `tenant_isolation` + GRANT a `app_user` (incl. `series` y `producto_alias` nuevas).
- **RBAC: todos los endpoints gated.** Se encontró y **se arregló** 1 hueco funcional HIGH.
- **Timbrado CFDI sandbox: verificado end-to-end** (UUID real devuelto por Facturama).
- Sin secretos hardcodeados; guard duro de "solo sandbox" en Facturama.

---

## Arreglado en esta rama ✅
1. **[HIGH] FACTURISTA no podía usar el cruce de productos** (`/productos/match`, `/alias` → 403 porque pedían `menu:productos`, que FACTURISTA no tenía). → Migración `0026_facturista_productos` (grant aditivo). Aplicada a local y cloud.
2. **[CRÍTICO] Bug en facturación**: la resolución de serie había borrado la carga de `productos`/`esquemas` (NameError al facturar). Detectado por los tests, arreglado.
3. **CFDI builder robusto**: público general (XAXX → S01/616 + Información Global), IVA siempre desglosado en objeto "02", `TaxZipCode == ExpeditionPlace`. Sin esto, el timbrado fallaba.
4. **Imports sin uso** (ruff F401 ×5) eliminados.
5. **Tipo muerto** `Movimiento` (frontend) eliminado.
6. **a11y**: `aria-label` en el buscador de producto y en el botón de quitar línea.

---

## Propuesto — requiere tu OK (NO ejecutado en cloud)

### Columnas de DB sin uso (drop sugerido)
Quitar requiere migración de `DROP COLUMN` (no se ejecuta en cloud sin tu visto bueno; quitar solo del modelo crearía drift). Candidatas (nunca leídas ni escritas):
- `mermas.evidencia_url` (`app/models/inventario.py:117`)
- `tenants.seats_limit` (`app/models/tenant.py:52`)
- `users.auth_provider` (`app/models/tenant.py:66`) — **OJO**: verificar nullability antes de dropear (hay inserts de User en el provisioning).

### Acumuladores de Cliente nunca escritos (aún)
`clientes.saldo_actual / ventas_ytd / ultima_venta_at / ultimo_pago_at` — expuestos en `ClienteOut` pero sin ruta de escritura. Son para fases POS/cobranza futuras. **Mantener** (no es basura, es trabajo pendiente).

### Módulo `conversiones`
Backend completo + 4 tests, pero el frontend `/conversiones` es un `ComingSoon` (único placeholder en el nav). Decisión de producto: construir la UI o esconder el ítem del menú.

---

## Observado — bajo riesgo / deuda
- **`siguiente_folio` legacy** (`services/series.py`) sigue siendo un fallback alcanzable (tenants sin series sembradas). No borrar todavía; quedará muerto cuando todo tenant tenga series.
- **`_next_folio` duplicado** en facturas.py y remisiones.py (lógica de 3 niveles copy-paste). Consolidar a futuro, baja prioridad.
- **Errores silenciados** en remisiones/facturas frontend (`.catch(()=>...)` en cotización/fetch): intencional, pero una falla de red transitoria no avisa al usuario. Mejora de UX pendiente.
- **RLS hardening opcional**: agregar `WITH CHECK` explícito y `FORCE ROW LEVEL SECURITY` como defensa en profundidad (hoy correcto porque `app_user` es NOBYPASSRLS).

---

## Para timbrar en producción (sandbox)
El pipeline CFDI quedó probado (timbró un CFDI real). Para timbrar con **nuestras series**:
1. Registrar las series (A, R, …) en el **Perfil Fiscal** de la cuenta Facturama sandbox.
2. `FACTURAMA_EXPEDITION_PLACE` debe ser un CP de "Lugares de expedición" del perfil (hoy `78390`, del perfil de v1).
3. Los productos necesitan `clave_sat` válida del catálogo SAT (el asistente `sat_ai` la sugiere).

**Nunca se timbra real**: `services/facturama.py` rechaza cualquier `base_url` que no sea `apisandbox.facturama.mx`.
