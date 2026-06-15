# QA intensivo full-stack — SmartSupply v2.0

Fecha: 2026-06-03. Auditoría de frontend (botones, funciones, tablas), backend
(endpoints, modelos) y uso de tablas en la BD. Metodología: 8 agentes de QA en
paralelo trazando cada flujo (frontend → API → schema → modelo → BD), seguidos
de verificación manual en el código real y arreglo de los bugs claros y seguros.

**Verificación final:** `pytest` 142/142 ✅ · `tsc --noEmit` 0 errores ✅ ·
backend importa y responde (health 200, auth 401) ✅.

---

## ✅ Bugs encontrados y ARREGLADOS (13)

### P0 — Crash / pantalla rota

1. **`ZERO` indefinido en `cfdi.py` → `NameError` al timbrar IEPS-cuota.**
   `services/cfdi.py:79,81` usaba `ZERO` sin definirlo. Cualquier timbrado de una
   línea con IEPS por cuota sin `contenido_litros` tronaba con 500.
   **Fix:** se define `ZERO = Decimal("0")`.

2. **Listas con `limit=1000` daban 422 silencioso → varias páginas vacías.**
   `productos`, `sucursales` y `clientes` tenían tope `le=200`, pero el frontend
   pedía `?limit=1000`/`500` en **Productos**, **Sucursales**, **Listas de precios**
   e **Inventario**. El endpoint rechazaba con 422 y esas pantallas/selectores de
   producto quedaban vacíos.
   **Fix:** tope subido a `le=1000` en `productos.py`, `sucursales.py`, `clientes.py`.

### P1 — Funcionalidad rota / dato incorrecto

3. **Cancelar factura siempre mandaba motivo "02" → liberación de inventario inalcanzable.**
   El backend solo libera el inventario reservado por las remisiones con **motivo 03**,
   pero el frontend lo tenía hardcodeado a "02". La función de cancelación-por-motivo
   (ya construida) nunca se podía usar y el stock quedaba reservado para siempre.
   **Fix:** selector de motivo SAT (01–04) en el modal de cancelar, con campo
   UUID de sustitución obligatorio para 01 y aviso en 03 (libera inventario).

4. **Retenciones se redondeaban a entero → corrupción fiscal.**
   `esquemas-impuesto` mostraba/guardaba tasas con `Math.round(x*100)`, colapsando
   ISR 1.25% → 1% e IVA retenido 10.6667% → 11%. Dato fiscal silenciosamente corrupto.
   **Fix:** se admiten decimales (`step` 0.01/0.0001) y se elimina el redondeo
   (helper `pct`). IVA/IEPS enteros siguen viéndose igual.

5. **El buscador de Productos creaba duplicados.**
   Al elegir un producto existente que no estuviera en la lista cargada, caía en
   "crear nuevo" → producto duplicado.
   **Fix:** un match existente nunca crea; si no está en memoria se trae por id
   (`GET /productos/{id}`); solo el botón "Crear nuevo" crea.

6. **Resolver de series podía tronar con 500 al emitir.**
   `services/series.py` usaba `.one_or_none()` sobre la serie `es_default`; si por
   una carrera quedaban dos defaults, `MultipleResultsFound` → 500 al emitir.
   **Fix:** `.order_by(created_at).first()` (determinista, no truena). *(El índice
   único parcial sigue recomendado — ver pendientes.)*

7. **El caché de permisos nunca se invalidaba.**
   `core/rbac.invalidate_auth_cache()` existía pero no se llamaba en ningún lado;
   tras cambiar el rol/permisos o desactivar un usuario, los permisos viejos seguían
   vigentes hasta 30s (ventana de autorización tras una revocación).
   **Fix:** se invoca al cambiar permisos de rol, al actualizar/eliminar membresía
   y al crear usuario.

### P2 — Seguridad / consistencia

8. **Crear usuario reseteaba la contraseña de un usuario de OTRA empresa.**
   Si el email coincidía con un usuario global existente, `crear_usuario` le
   sobreescribía la contraseña en Supabase (y se tragaba el error), pudiendo además
   dejar una cuenta de Auth huérfana.
   **Fix:** no se toca la contraseña de un usuario existente (para eso está
   `/{id}/password`); se valida la membresía duplicada **antes** de crear la cuenta
   de Auth; se invalida el caché.

9. **N+1 en `list_memberships`.** Cargaba `user` y `role` por fila (1+2N queries).
   **Fix:** `joinedload(Membership.user, Membership.role)`.

10. **Existencias incluía productos/almacenes borrados.** La consulta de existencias
    y valuación no filtraba `deleted_at`, mostrando stock de catálogo eliminado.
    **Fix:** `filter(Producto.deleted_at.is_(None), Almacen.deleted_at.is_(None))`.

11. **"Enviar por correo" por fila visible para usuarios de solo lectura.**
    La acción de fila no tenía guardia de permiso → 403 al usarla.
    **Fix:** `hidden: () => !canWrite` (el botón masivo ya estaba protegido).

12. **Clases `border-primary`/`bg-primary` inexistentes (hover sin efecto).**
    El modal Facturar usaba un token de color que no existe en el design system.
    **Fix:** `accent` (token real).

13. **Menú Empresa/Correo se mostraba a roles que recibían 403.**
    `nav.tsx` los protegía con `menu:ajustes.usuarios`, pero el backend exige
    `membership:gestionar` → la página cargaba en blanco para esos roles.
    **Fix:** visibilidad alineada a `membership:gestionar`.

---

## 🗃️ Uso de tablas en la BD (28 tablas)

- **Todas se usan.** No hay tablas totalmente muertas ni migraciones huérfanas
  (cada `__tablename__` tiene exactamente un `create_table`).
- **`mermas` es de solo escritura:** se inserta un registro de auditoría en cada
  movimiento tipo MERMA (`inventario.py`), pero **nunca se lee** — no hay endpoint
  GET ni vista. Es un log de auditoría legítimo; **recomendación:** conservarla y,
  si se quiere aprovechar, agregar `GET /inventario/mermas` + panel de reporte.
- `permissions` es de solo lectura (catálogo RBAC sembrado por migraciones) — patrón
  normal, no es defecto.

---

## 📋 Pendientes / recomendaciones (NO arreglados — requieren decisión, migración o feature)

Ordenados por impacto. No se tocaron para no introducir riesgo sin tu visto bueno.

**Datos / integridad (sugieren migración):**
- **`precio_overrides` sin índice único ni edición.** Se pueden apilar overrides
  duplicados para el mismo cliente/producto/presentación; gana el más nuevo y los
  viejos quedan huérfanos (sin forma de editarlos, solo crear/borrar). Sugerido:
  índice único parcial + endpoint PATCH + UI de edición.
- **Series `es_default` sin índice único parcial.** El modelo lo documenta pero no
  existe. El resolver ya no truena (fix #6), pero conviene el índice para impedir
  dos defaults. Migración dependiente de datos (limpiar duplicados antes).
- **Lote "default" duplicable** bajo recepciones concurrentes (sin índice único en
  `(producto, almacén, numero_lote)`): el stock se parte en dos filas.
- **Generadores de código (cliente/proveedor/esquema/SKU) tienen carrera:** dos altas
  concurrentes calculan el mismo código → 409 sin reintento. Sugerido: reintento
  on-IntegrityError o secuencia/advisory-lock por tenant.

**Lógica de negocio (requieren decisión de producto):**
- **`resolver_precio` no valida `sucursal.cliente_id == cliente_id`.** Si la sucursal
  (destino) pertenece a un cliente distinto al de facturación, podría aplicar la lista
  del cliente equivocado. No se cambió por ambigüedad de intención — confirmar si ese
  caso puede ocurrir en tu flujo.
- **IEPS-cuota en productos de peso variable** calcula litros desde `cantidad_surtida`
  (unidades base); si `contenido_litros` no es "por pieza base", la base del IEPS
  queda mal. Confirmar semántica de `contenido_litros`.
- **Precisión de tasas en BD:** retenciones con >4 decimales de fracción (ej. 10.6667%
  → 0.106667) pueden truncarse a 4 decimales por el tipo de columna.

**Features construidas en backend pero sin UI (gaps de alcance):**
- **Conversiones:** CRUD completo en backend, pero la página es un stub "Coming Soon".
- **Recepción de compras con peso variable / parcial:** el backend lo soporta
  (`recepciones[].cantidad_base`), la UI solo hace "recibir todo" a peso teórico.
- **`/ordenes-compra/{id}/transition` permite EN_TRANSITO→RECIBIDA** sin crear la
  entrada de inventario (la UI lo evita, pero la API no). Sugerido: quitar RECIBIDA
  de los destinos de `/transition`.
- **Esquemas IEPS por CUOTA** no se pueden crear desde la UI (faltan campos
  `tipo_ieps`/`ieps_cuota`).
- **`/facturas/directa`** (factura manual sin remisión) existe pero ninguna pantalla
  la llama.

**Seguridad / hardening:**
- **Contraseña SMTP en texto plano** en `tenants.config` (la API la enmascara al leer,
  pero está sin cifrar en la BD). Cifrar at-rest para producción.
- **Empresa "Verificar RFC"** usa `/clientes/validar-rfc` (gated `menu:clientes`):
  un admin fiscal sin ese permiso recibe 403 en ese botón. Además consume un folio
  de Facturama por clic (sin debounce). El badge "Verificado" no se persiste.

**UX menor:**
- Páginas CRUD con `searchable:false` no usan la búsqueda del backend (solo busca en
  la página actual cargada).
- `RemisionUpdate` no permite editar líneas (alta es create-only).
- Constante `READ` sin uso (`inventario`), rama `step="serie"` inalcanzable (`remisiones`).

---

## Archivos modificados (arreglos)

Backend: `services/cfdi.py`, `services/series.py`, `api/v1/productos.py`,
`api/v1/sucursales.py`, `api/v1/clientes.py`, `api/v1/inventario.py`,
`api/v1/memberships.py`, `api/v1/roles.py`.

Frontend: `app/(app)/esquemas-impuesto/page.tsx`, `app/(app)/productos/page.tsx`,
`app/(app)/facturas/page.tsx`, `app/(app)/remisiones/page.tsx`, `lib/nav.tsx`.
