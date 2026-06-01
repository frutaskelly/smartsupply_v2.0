# Plan — Remisiones: pendientes (handoff para continuar en otra sesión)

> **Para la próxima sesión de Claude Code (otra computadora vía SSH a esta carpeta).**
> Roadmap acordado con el usuario: **terminar Remisiones → luego Facturas → POS al final.**
> Este documento cubre los **4 pendientes de Remisiones** ya aprobados. Hacerlos
> en orden (1 → 4): de menor a mayor riesgo. Cada feature: rama propia, commit verde
> (tsc/tests), PR con cuenta `frutaskelly`, merge a `main`.

## Estado actual (lo que YA existe en v2)
- **Backend** `backend/app/api/v1/remisiones.py`: `GET` lista, `POST` crear, `GET /{id}` detalle,
  `PATCH /{id}` (editar BORRADOR — 409 si no es borrador), `POST /{id}/confirmar` (reserva stock),
  `POST /{id}/cancelar` (libera), `DELETE /{id}`.
- **Schema** `backend/app/schemas/remision.py`: `RemisionUpdate` ya incluye `almacen_id, lista_precios_id,
  fecha_entrega, descuento, notas, nota_entrega`.
- **Frontend** `frontend/app/(app)/remisiones/page.tsx`: lista (DataTable, filtros estado/cliente),
  alta con líneas + cruce IA + cotización + **pegar de Excel** + confirmar/cancelar, y **detalle
  expandible (slide-down)**. NO hay acción "Editar" ni impresión.
- **Cruce/precios reutilizables**: `POST /api/v1/productos/match` (exacto/alias/difuso/IA),
  `POST /api/v1/productos/alias` (aprende alias), `GET /api/v1/precios/cotizar`.
- **Componentes UI nuevos disponibles**: `DataTableSmart` (filas expandibles + columna de acciones
  con menú ⋮ + todo encendido), `EmptyState` (con `icon`), `ConfirmDialog` (con `confirmVariant`),
  `Checkbox`. Tokens de color (sin hex/escala cruda). Ver `/ajustes/sistema-diseno`.

## Referencia v1 (autoritativa)
`/Users/michelzarate/Documents/Claude/Smart Supply/cadena-de-suministro-ai`
- Remisiones: `backend/app/api/v1/remisiones.py` → `from-excel-bd`, `from-batch`, `resolve-precios`,
  `cfdi-preview`. Frontend: `frontend-next/app/remisiones/{page,nueva,conversion}.tsx`.
- Devoluciones: `backend/app/api/v1/devoluciones.py` (`POST`, `POST /{id}/confirmar`, `GET`, `GET /{id}`),
  modelo `backend/app/models/devolucion.py`.

---

## 1. Editar borrador en la UI  (S — backend listo)
**Qué:** acción "Editar" en remisiones BORRADOR que reusa el form de alta, precargado, y guarda con `PATCH`.
**Pasos:**
- En `remisiones/page.tsx`, añadir acción "Editar" (en la columna de acciones / o en el panel expandible)
  visible solo para `estado === "BORRADOR"`.
- Añadir estado `editId`. Al abrir, `GET /{id}` para precargar cliente/sucursal/almacén/serie/notas y
  líneas (producto, presentación, cantidad, precio). Reutilizar el modo "create" del componente.
- Al guardar: si `editId` → `PATCH /api/v1/remisiones/{editId}` (con `RemisionUpdate` + líneas); si no → `POST`.
- Considerar que `PATCH` solo permite BORRADOR (el backend ya devuelve 409). Ocultar Editar en CONFIRMADA/CANCELADA.
**Aceptación:** editar líneas/cliente/notas de un borrador, guardar, la lista refleja el cambio; confirmar sigue funcionando.

## 2. Nota de entrega imprimible / PDF  (M)
**Qué:** vista imprimible (print-to-PDF del navegador) de la remisión como nota de entrega.
**Pasos:**
- Campo ya existe (`nota_entrega` en schema/modelo). Exponer `nota_entrega` en el form de alta/edición (Textarea).
- Crear ruta de impresión mínima fuera del shell, p. ej. `frontend/app/(print)/remisiones/[id]/page.tsx`
  (layout sin sidebar/topbar) o un componente que se renderiza y llama `window.print()` con `@media print`.
- Contenido: encabezado empresa/tenant, folio, fecha, cliente, **sucursal de entrega**, tabla de líneas
  (producto, presentación, cantidad, precio, importe), total, `nota_entrega`/`notas`, espacio de firma.
- Acción "Imprimir / PDF" desde el panel de detalle expandible.
**Aceptación:** abre vista limpia; print-to-PDF del navegador genera una nota de entrega legible.

## 3. Importación masiva → remisiones  (L — fasear)
**Qué:** importar Excel/CSV (y luego PDF/foto) → fuzzy match contra base maestra → revisar/resolver
ambiguas → crear remisión. Hoy solo existe "pegar de Excel" interactivo.
**Fase A (Excel/CSV):**
- Subir/parsear archivo (columnas: producto, cantidad, presentación, precio opcional).
- Cada fila → `POST /productos/match`; grid de revisión con filas ambiguas resolubles inline
  (al confirmar, `POST /productos/alias` para aprender).
- Endpoint backend nuevo, p. ej. `POST /api/v1/remisiones/from-import` (o replicar nombres v1
  `from-excel-bd`/`from-batch`) que recibe líneas ya matcheadas y crea la remisión reusando la lógica de `POST`.
  Agrupar por cliente si el archivo trae varios.
**Fase B (PDF/foto):** extracción (OCR / visión LLM) → texto en filas → mismo pipeline. Diferir; mayor esfuerzo.
**Aceptación:** importar un Excel/CSV → revisar → crea remisión con productos matcheados; filas sin match marcadas; alias aprendidos persisten.

## 4. Devoluciones desde remisión  (L — depende de Facturas)
**Qué:** notas de crédito / devoluciones ligadas a remisión/factura: reingreso a inventario + merma.
**Pasos:**
- Portar de v1: modelo `devolucion.py` (+ migración aditiva), router `devoluciones.py`
  (`POST`, `POST /{id}/confirmar`, `GET`, `GET /{id}`), schemas, RBAC.
- `confirmar` revierte inventario (reingreso) y registra merma.
- Frontend: alta de devolución desde una remisión/factura; lista; detalle.
- **Coordinar con Facturas:** la nota de crédito CFDI requiere el timbrado completo. **Hacer DESPUÉS** de
  cerrar el track de Facturas (timbrado prod / Pagos-REP). Por eso va al final.
**Aceptación:** crear y confirmar una devolución de una remisión → stock reingresado, merma registrada.

---

## Notas de entorno / gotchas (importantes para la otra sesión)
- **Dev server**: corre en **http://localhost:3012**, lanzado desde el **checkout principal**
  (`smartsupply-v2.0/frontend`), NO desde un worktree (los worktrees no tienen `node_modules`).
  `package.json` trae `dev -p 3000`; el proceso real usa `-p 3012` (override al lanzar).
- **Typecheck en un worktree** (sin deps): `ln -s ../../../frontend/node_modules ./node_modules`,
  `./node_modules/.bin/tsc --noEmit`, luego `rm -f ./node_modules`. (Turbopack `next build` NO acepta el symlink.)
- **No hay config de ESLint** → los imports sin usar no rompen el build; verificar a mano.
- **Backend dev** corre contra **Supabase cloud** (no el docker local 5434). **Tests** corren contra docker 5434.
- **Facturas: solo sandbox** (`apisandbox.facturama.mx`); guard duro contra URL de producción.
- **Resolución de serie**: override → sucursal → cliente → default; folio **sin guion**.
- **RBAC**: remisiones usan `remision:gestionar`; `/productos/match` y `/alias` gated con `menu:productos`.
- **PRs**: usar la cuenta `gh` **`frutaskelly`** (`gh auth switch --user frutaskelly`). El repo es
  `frutaskelly/smartsupply_v2.0`.
- **Sistema de diseño**: usar componentes de `components/ui` + tokens; ver `/ajustes/sistema-diseno`.
  `DataTableSmart` ya da filas expandibles + columna de acciones con menú ⋮.
