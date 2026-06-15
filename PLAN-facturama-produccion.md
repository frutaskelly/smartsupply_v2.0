# Facturama: paso de sandbox a producción (CFDI 4.0)

Guía para activar el **timbrado real ante el SAT**. La arquitectura ya soporta
producción por configuración: el ambiente lo decide `FACTURAMA_BASE_URL` y un
guard de seguridad exige `FACTURAMA_ALLOW_PRODUCTION=true` para apuntar fuera del
sandbox (`backend/app/services/facturama.py`).

> ⚠️ En producción cada timbre es un **CFDI real**. Una cancelación mal hecha o un
> receptor con datos que no cuadran con el SAT son problemas fiscales, no bugs.

---

## 1. Checklist de readiness (antes de tocar el `.env`)

### Cuenta y certificados (lado Facturama / SAT) — _ya los tienes_
- [ ] Cuenta de **producción** de Facturama activa (usuario + password de prod).
- [ ] **CSD** (certificado `.cer` + llave `.key` + contraseña) del emisor cargado en
      Facturama producción y **vigente** (no es el CSD de pruebas).
- [ ] El RFC del emisor del CSD coincide con el RFC fiscal real del negocio.
- [ ] El/los **lugar(es) de expedición** (CP) están registrados en Facturama.
- [ ] Si vas a enviar series propias: las series están **dadas de alta** en la
      cuenta/sucursal de Facturama (si no, deja `FACTURAMA_SEND_SERIE=false`).

### Datos del emisor (tenant) en la BD
- [ ] `tenant.legal_name`, `tenant.regimen_fiscal_sat`, `tenant.domicilio_fiscal_cp`
      reales y consistentes con la Constancia de Situación Fiscal del emisor.

### Datos de receptores (clientes) — **bloqueante para clientes sembrados**
- [ ] Los clientes a facturar tienen **RFC real**, `legal_name` EXACTO como en su
      Constancia de Situación Fiscal, `regimen_fiscal` y CP correctos.
      CFDI 4.0 valida Nombre + Régimen + CP contra el padrón del SAT: los clientes
      ficticios sembrados serán **rechazados**. Usa el botón "Validar RFC"
      (`GET /api/v1/clientes/validar-rfc`) para verificar antes de timbrar.
- [ ] Público en general: el flujo XAXX010101000 ya manda Nombre/Régimen/Uso fijos
      e Información Global (no requiere acción).

### Productos
- [ ] Productos con **clave SAT (ClaveProdServ)** y **clave de unidad** reales.
      El fallback `01010101` ("no existe en el catálogo") el SAT lo acepta pero no
      es lo ideal para venta real.

---

## 2. El switch de `.env` (en el entorno desplegado: el Mini / prod)

Cambia **solo** estas variables en el `.env` de producción:

```diff
- FACTURAMA_BASE_URL=https://apisandbox.facturama.mx
+ FACTURAMA_BASE_URL=https://api.facturama.mx

- FACTURAMA_ALLOW_PRODUCTION=false
+ FACTURAMA_ALLOW_PRODUCTION=true

- FACTURAMA_FAKE_CANCEL=true
+ FACTURAMA_FAKE_CANCEL=false

  # Credenciales de la cuenta de PRODUCCIÓN (no las de sandbox):
  FACTURAMA_USER=<usuario_produccion>
  FACTURAMA_PASSWORD=<password_produccion>

  # Emisor real (CSD cargado en Facturama). Recomendado fijarlo explícito:
  FACTURAMA_ISSUER_RFC=<RFC_real_emisor>
  FACTURAMA_ISSUER_NAME=<razón social emisor>      # opcional (cae a tenant.legal_name)
  FACTURAMA_ISSUER_REGIMEN=<régimen SAT>           # opcional (cae a tenant.regimen_fiscal_sat)
  FACTURAMA_EXPEDITION_PLACE=<CP lugar expedición> # opcional (cae a tenant.domicilio_fiscal_cp)
```

Reinicia el backend (en el stack docker de prod, recrea el contenedor del backend
para que recargue el `.env`).

---

## 3. Verificación post-switch

1. **Log de arranque** del backend: debe decir `facturama=producción`. Si la
   configuración es peligrosa verás `WARNING Facturama config: …` (p. ej. host de
   producción con `FAKE_CANCEL=true`, o sin `ALLOW_PRODUCTION`). El detalle de los
   avisos vive en `facturama.startup_warnings()`.
2. **Validar un RFC real** desde el formulario de clientes (consume 1 folio).
3. **Timbrar UNA factura de prueba real** con un receptor real (idealmente a tu
   propio RFC o público en general). Revisa que el XML/PDF descarguen y que el UUID
   exista en el portal del SAT.
4. **Cancelar esa factura de prueba** (motivo 02) y confirmar que la cancelación
   aparece en el SAT (con `FAKE_CANCEL=false` la cancelación SÍ llega al PAC).

---

## 4. Rollback

Para volver a sandbox: invertir el diff de la sección 2
(`BASE_URL` → sandbox, `ALLOW_PRODUCTION=false`, `FAKE_CANCEL=true`, credenciales
de sandbox) y reiniciar. El guard de `facturama.py` vuelve a bloquear cualquier
host que no sea sandbox.

---

## 5. Notas de implementación (qué cambió en el código)

- **Bug corregido**: `ZERO` no estaba definido en `services/cfdi.py` (se usa en el
  cálculo de IEPS por cuota) → `NameError` que tumbaba el timbrado real. Ya definido.
- Docstrings/mensajes que decían "SOLO SANDBOX" ahora reflejan que el ambiente es
  por configuración (`facturama.py`, `facturas.py`, `clientes.py`).
- `FacturamaClient` expone `is_sandbox` / `is_production` / `env_label`.
- `facturama.startup_warnings()` + log de ambiente en `main.py` (lifespan).
- `FACTURAMA_SEND_SERIE` documentado en `config.py` y `.env.example`.

El comportamiento en **sandbox no cambia**: todos los cambios son de claridad,
validación de configuración y un fix de bug.
