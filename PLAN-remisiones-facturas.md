# Plan — Módulos Remisiones + Facturas (sandbox) + IA cruce + QA total

Rama: `feat/remisiones-facturas-ia` (no se toca `main`; PR al final).
Referencia v1: `/Users/michelzarate/Documents/Claude/Smart Supply/cadena-de-suministro-ai`.

## Decisiones del usuario
1. **Facturas**: portar Facturama de v1 (sandbox; `FACTURAMA_USER=michelzarate` + password ya existen en v1). **Solo sandbox, nunca timbrado real.**
2. **IA cruce**: enfoque híbrido con **alias aprendidos persistentes** (recomendado) — ver Fase 3.
3. **Entrega**: rama + PR para revisión.
4. **Limpieza QA**: reportar + borrar lo seguro; drops de tablas NO se ejecutan en cloud sin OK.

## Restricciones
- Solo sandbox para facturas. Guard duro contra URL de producción de Facturama.
- Migraciones aditivas se aplican al cloud (el backend dev corre contra Supabase) para poder probar; drops solo se proponen.
- Cada commit "verde": compila + tests del área pasan.

---

## Fase 0 — Cimientos ✅
- Rama creada, módulo de series commiteado (72e7d1d).

## Fase 1 — Remisiones (módulo completo)
**Backend** (ya existe create/confirm/cancel + resolución de serie; revisar vs v1):
- Revisar `remisiones.py`: edición de líneas, detalle, PDF/print, validaciones.
- Asegurar resolución de serie + folio sin guion en todos los caminos.

**Frontend** (hoy es ComingSoon → construir):
- Lista con filtros (estado, cliente, fecha), badges de estado.
- Alta/edición: cliente → sucursal → almacén → **preview de serie** (`/series/resolver`) con opción de cambiarla → líneas.
- Líneas: **buscador de productos** (combobox) + **pegar como Excel** (Fase 4) + precio autocalculado (resolutor) editable.
- Acciones: guardar borrador, **Confirmar** (reserva stock), **Cancelar** (libera).
- Vista imprimible / PDF de la remisión.

## Fase 2 — Facturas (sandbox)
**Backend**:
- Portar de v1: `services/facturama.py` (thin client, stub si no hay creds), `services/cfdi_builder.py`.
- `factura desde remisiones` ya existe (desglose IVA/IEPS/retenciones); añadir `timbrar` (sandbox), `cancelar`, XML/PDF.
- Copiar creds sandbox de v1 a `.env` de v2. Guard: solo `apisandbox.facturama.mx`.

**Frontend**:
- Lista de facturas (estado: borrador/timbrada/cancelada).
- Generar desde remisiones: selección de remisiones CONFIRMADAS del mismo cliente → serie/uso CFDI/forma-método pago → previsualizar totales → timbrar (sandbox).
- Ver/descargar XML y PDF; cancelar.

## Fase 3 — IA cruce de productos (alias aprendidos)
Objetivo: detectar errores de escritura ("zanahorias"→"zanahoria") y sinónimos regionales ("Chile Cuaresmeño"="Chile Jalapeño"). El usuario confirma **una vez**, se guarda y no se vuelve a preguntar.

- **Tabla `producto_alias`** (tenant-scoped): `alias_normalizado` → `producto_id`, origen (manual/ia), confirmado_por, created_at. Único por (tenant, alias_normalizado).
- **Resolución en cascada** (`POST /productos/match`, texto → candidatos con score):
  1. Exacto (sku/nombre normalizado).
  2. **Alias aprendido** (instantáneo, ya confirmado).
  3. Difuso: `pg_trgm` + `Producto.sinonimos`.
  4. **LLM (Anthropic)** para typos/sinónimos regionales cuando hay API key con saldo (degradación elegante si no).
- **Confirmar** (`POST /productos/alias`): guarda el alias → futuras búsquedas lo resuelven solo.
- Integración: en líneas de remisión/factura y en el pegado Excel, si una fila no matchea, se ofrece "¿quisiste decir…?"; al confirmar, se aprende.
- Para no catalogados existe `conversiones` (catalogado↔no catalogado con factor/merma) — se enlaza.

## Fase 4 — Pegar como Excel + motor de búsqueda
- Componente **grid de pegado**: pegas filas (producto, cantidad, presentación, precio) desde Excel → parse → cada fila pasa por el cruce (Fase 3) → llena las líneas; filas ambiguas se resuelven inline.
- **Combobox de búsqueda** de productos (por sku/nombre/sinónimo/alias) reutilizable en remisión y factura.

## Fase 5 — QA de remisiones + facturas
- Tests pytest: remisión (alta/confirmar/cancelar/serie/folio), factura (desde remisiones/timbrado sandbox-stub/cancelar), match IA, alias.
- Tests de frontend mínimos donde aplique. Arreglar todo lo que falle.

## Fase 6 — QA intenso de toda la plataforma
- Correr **toda** la suite; arreglar fallos.
- Detectar **tablas/columnas/código sin uso** (modelos huérfanos, endpoints muertos, columnas no referenciadas, imports muertos).
- **Reportar** (informe priorizado `QA-REPORT.md`) + **borrar lo seguro** (código muerto). Drops de DB: solo proponer migración (no ejecutar en cloud).
- Revisión transversal: RLS por tabla, permisos/RBAC, N+1, validaciones, manejo de errores, índices faltantes.

## Fase 7 — Listo para producción
- `ruff`/lint backend, `tsc --noEmit` + `next build` frontend, cadena de migraciones sana, seeds sanos.
- Abrir **PR** con resumen + `QA-REPORT.md`.

## Entregables al despertar
- PR `feat/remisiones-facturas-ia` con: módulos remisiones + facturas (sandbox) + IA cruce + pegado Excel + buscador, tests, y `QA-REPORT.md` con hallazgos y limpieza segura aplicada.
- Facturas: **solo sandbox**, sin timbrado real.
