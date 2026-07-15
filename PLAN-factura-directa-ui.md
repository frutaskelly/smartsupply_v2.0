# Plan — UI de Factura Directa + Lista de Facturas estilo Remisiones

> Handoff para una sesión nueva enfocada. El **backend ya está hecho y desplegado**
> (commit `fcdbef9`). Solo falta la UI. Modelo a seguir: la página de **Remisiones**
> (`frontend/app/(app)/remisiones/page.tsx`).

## Contexto: qué YA existe (backend, en prod)
- Endpoint `POST /api/v1/facturas/directa` — crea factura BORRADOR **sin remisión**.
  Ahora **requiere `almacen_id`** y guarda `cantidad_base` + (al timbrar) `lote_id` por línea.
  Payload: `{ cliente_id, almacen_id, serie_id?, uso_cfdi?, forma_pago?, metodo_pago?, notas?, lineas: [{ producto_id, cantidad, precio_unitario, presentacion? }] }`.
- **Timbrar** (`POST /facturas/{id}/timbrar`) descuenta inventario de `disponible` del `almacen_id` (movimiento `CONFIRMACION_FACTURA`, permite negativo = sobregiro).
- **Cancelar** (`POST /facturas/{id}/cancelar`, body `{ motivo, uuid_sustitucion?, inventario: "devolucion"|"perdida" }`): devolución regresa a disponible (`ENTRADA_DEVOLUCION`), pérdida lo mantiene fuera.
- Otros: `desde-remisiones`, `descartar` (DELETE, solo BORRADOR), `xml`, `pdf`, `enviar`.
- Hay **2 almacenes** (Bodega Central, Pachuca). El selector de almacén es obligatorio.

## Objetivo 1 — Alta "Nueva factura directa"
Pantalla de captura modelada en el alta de remisión (`mode === "create"` en remisiones/page.tsx).
- **Reusar componentes hoja** (NO refactorizar remisiones si es riesgoso): `ProductoCombobox`,
  `CrearProductoModal`, `KeyboardCombobox`, `Field/Input/Select/Textarea`, y el endpoint
  `POST /api/v1/productos/parse-pegado` para **Pegar de Excel** + columna **Match IA**
  (ver la implementación exacta en remisiones/page.tsx: `procesarPaste`, `resolverMatchIA`,
  `matchPresentacion`, `LoadingDots`, la tabla con `showMatchIA`).
- Campos de cabecera: **Cliente** (KeyboardCombobox), **Almacén** (KeyboardCombobox, requerido),
  **Serie** (opcional, `?tipo_documento=FACTURA`), Uso CFDI / forma / método (opcionales con
  defaults del cliente). Nota opcional.
- Tabla de líneas: producto (ProductoCombobox) · cantidad · presentación · precio_unitario ·
  (importe/impuestos informativos). Pegar de Excel + Match IA + crear producto al vuelo.
- Acciones: **Guardar borrador** (POST /directa) y **Timbrar** (POST /directa → luego
  /{id}/timbrar). Ojo: timbrar descuenta inventario; si el ambiente es sandbox, `FACTURAMA_FAKE_*`.
- Consideración de reuso: evaluar extraer un `<CapturaLineas>` compartido entre remisión y
  factura directa (el editor de líneas es ~idéntico). Si el refactor es arriesgado, duplicar la
  tabla en el primer corte y extraer después.

## Objetivo 2 — Lista de facturas estilo remisiones (acciones por lote)
Hoy `facturas/page.tsx` usa `DataTableSmart` con `rowActions` individuales. Darle selección
múltiple + toolbar de lote, como remisiones (`selected`, `clearSelection`, botones bulk):
- Acciones por lote sobre la selección: **Timbrar N**, **Cancelar N** (con el modal de motivo
  SAT + devolución/pérdida ya existente), **Descargar PDF/XML N**, **Enviar por correo N**
  (reusar el patrón multi-cliente de remisiones: un correo por cliente).
- Mantener el slide-down de detalle y el deep-link `?ver=<id>`.
- Estados factura: BORRADOR·TIMBRADA·CANCELADA (distinto de remisión). Las acciones dependen del
  estado: timbrar solo BORRADOR; cancelar solo TIMBRADA; descartar solo BORRADOR.

## Diferencias clave remisión vs factura (NO son idénticas)
| | Remisión | Factura |
|---|---|---|
| Estados | BORRADOR·CONFIRMADA·CANCELADA·FACTURADA | BORRADOR·TIMBRADA·CANCELADA |
| Acciones | confirmar, cancelar, editar, facturar | timbrar (SAT), cancelar (motivo SAT), descartar, XML/PDF |
| Naturaleza | inventario | fiscal (CFDI/PAC) |

Comparten: **editor de líneas** (Pegar Excel/Match IA/crear producto) y el **patrón de tabla
con acciones por lote**. NO comparten las acciones concretas.

## Verificación esperada
- `tsc --noEmit` limpio · `npm run build` OK.
- Alta directa: crear borrador, timbrar (sandbox), verificar que descuenta inventario del almacén
  (query `movimientos_inventario` tipo `CONFIRMACION_FACTURA`), cancelar y verificar el regreso.
- Lista: selección múltiple + una acción por lote (p. ej. enviar 2).

## Arranque sugerido
`/newsession factura-directa-ui` → leer remisiones/page.tsx (alta + bulk) como plantilla →
construir alta directa → luego lista con batch. Reusar todo lo reusable.
