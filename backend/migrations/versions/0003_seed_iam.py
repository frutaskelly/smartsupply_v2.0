"""seed iam catalog: permissions + preset roles + assignments

Revision ID: 0003_seed_iam
Revises: 0002_iam_schema_rls
Create Date: 2026-05-28

Global system data every deployment needs (this is the "clean production
format for new clients"): the permission catalog, the preset roles, and which
permissions each preset role carries.

Differences vs v1:
  * No chat/whatsapp/documentos/agentes menus — those modules are cut from v2.
  * No SUPER_ADMIN role — platform operators are an email allowlist used only
    for provisioning, not an in-tenant role.
  * Adds menu:series (fiscal series), a kept v2 module.

OWNER intentionally gets NO explicit rows: it is a full bypass resolved in
code (app/core/rbac.py). The catalog stays data; the bypass stays logic.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003_seed_iam"
down_revision: Union[str, None] = "0002_iam_schema_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (id, recurso, accion, vertical, descripcion)
MENU_PERMISSIONS = [
    ("menu:dashboard", "menu", "dashboard", None, "Ver dashboard principal"),
    ("menu:pos.pedido", "menu", "pos.pedido", "pos", "POS - Captura de pedido"),
    ("menu:pos.caja", "menu", "pos.caja", "pos", "POS - Caja"),
    ("menu:pos.almacen", "menu", "pos.almacen", "pos", "POS - Almacén / surtido"),
    ("menu:pos.salida", "menu", "pos.salida", "pos", "POS - Salida / entrega"),
    ("menu:facturas", "menu", "facturas", None, "Ver y gestionar facturas"),
    ("menu:remisiones", "menu", "remisiones", None, "Ver y gestionar remisiones"),
    ("menu:conversiones", "menu", "conversiones", None, "Conversión de remisiones/pedidos"),
    ("menu:inventario", "menu", "inventario", None, "Ver inventario"),
    ("menu:compras", "menu", "compras", None, "Órdenes de compra"),
    ("menu:productos", "menu", "productos", None, "Catálogo de productos"),
    ("menu:productos.categorias", "menu", "productos.categorias", None, "Categorías de productos"),
    ("menu:esquemas_impuesto", "menu", "esquemas_impuesto", None, "Esquemas de impuesto"),
    ("menu:listas_precios", "menu", "listas_precios", None, "Listas de precios"),
    ("menu:clientes", "menu", "clientes", None, "Clientes / CRM"),
    ("menu:series", "menu", "series", None, "Series fiscales"),
    ("menu:configuraciones", "menu", "configuraciones", None, "Configuraciones del tenant"),
    ("menu:facturacion", "menu", "facturacion", None, "Configuración de facturación / CFDI"),
    ("menu:sistema", "menu", "sistema", None, "Sistema de diseño y herramientas"),
    ("menu:ajustes.usuarios", "menu", "ajustes.usuarios", None, "Gestionar usuarios"),
    ("menu:ajustes.roles", "menu", "ajustes.roles", None, "Gestionar roles y permisos"),
    ("menu:ajustes.empresa", "menu", "ajustes.empresa", None, "Configuración de la empresa"),
    ("menu:ajustes.facturacion", "menu", "ajustes.facturacion", None, "Billing del SaaS (OWNER)"),
]

POS_PERMISSIONS = [
    ("pedido:capturar", "pedido", "capturar", "pos", "Crear pedido en PENDIENTE_PAGO"),
    ("pedido:cobrar", "pedido", "cobrar", "pos", "Cobrar pedido y transitar a PAGADO"),
    ("pedido:surtir", "pedido", "surtir", "pos", "Surtir y marcar LISTO_ENTREGA"),
    ("pedido:entregar", "pedido", "entregar", "pos", "Marcar pedido como ENTREGADO"),
    ("devolucion:crear", "devolucion", "crear", "pos", "Crear una devolución"),
    ("devolucion:reembolso_efectivo", "devolucion", "reembolso_efectivo", "pos", "Autorizar reembolso en efectivo"),
    ("cliente:read_crm", "cliente", "read_crm", "pos", "Ver perfil CRM del cliente"),
]

ALL_PERMISSIONS = MENU_PERMISSIONS + POS_PERMISSIONS

# (nombre, vertical, descripcion). OWNER omitted on purpose (code-level bypass).
PRESET_ROLES = [
    ("OWNER", None, "Dueño del tenant — acceso total (bypass por código)"),
    ("ADMIN", None, "Administrador del tenant"),
    ("TOMADOR", "pos", "Captura pedidos en el POS"),
    ("CAJERO", "pos", "Cobra y gestiona devoluciones en el POS"),
    ("BODEGUERO", "pos", "Surte pedidos y revisa inventario"),
    ("REPARTIDOR", "pos", "Entrega pedidos"),
    ("CAPTURISTA_GOV", "cadena_gov", "Captura remisiones/conversiones (gobierno)"),
    ("SURTIDOR_GOV", "cadena_gov", "Surte remisiones de gobierno"),
    ("FACTURISTA", None, "Genera y administra facturas/CFDI"),
    ("CONTADOR", None, "Consulta facturas y remisiones"),
]

# nombre -> [permission_id, ...]. OWNER omitted (bypass). ADMIN = everything
# except billing.
_ALL_MENU_EXCEPT_BILLING = [p[0] for p in MENU_PERMISSIONS if p[0] != "menu:ajustes.facturacion"]
_ALL_POS = [p[0] for p in POS_PERMISSIONS]

ROLE_ASSIGNMENTS = {
    "ADMIN": _ALL_MENU_EXCEPT_BILLING + _ALL_POS,
    "TOMADOR": ["menu:pos.pedido", "menu:clientes", "menu:productos", "pedido:capturar", "cliente:read_crm"],
    "CAJERO": ["menu:pos.caja", "menu:clientes", "pedido:cobrar", "devolucion:crear", "devolucion:reembolso_efectivo", "cliente:read_crm"],
    "BODEGUERO": ["menu:pos.almacen", "menu:inventario", "pedido:surtir"],
    "REPARTIDOR": ["menu:pos.salida", "pedido:entregar"],
    "CAPTURISTA_GOV": ["menu:dashboard", "menu:remisiones", "menu:conversiones", "menu:clientes", "menu:productos"],
    "SURTIDOR_GOV": ["menu:dashboard", "menu:remisiones", "menu:inventario"],
    "FACTURISTA": ["menu:dashboard", "menu:facturas", "menu:remisiones", "menu:facturacion", "menu:series"],
    "CONTADOR": ["menu:dashboard", "menu:facturas", "menu:remisiones"],
}


def upgrade() -> None:
    # Raw INSERTs (not op.bulk_insert) so the migration renders identically
    # online and offline (`alembic upgrade --sql`) — the data is fixed catalog.

    # ── permissions ──
    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})"
        for pid, rec, acc, vert, desc in ALL_PERMISSIONS
    )
    op.execute(
        f"""
        INSERT INTO permissions (id, recurso, accion, vertical, descripcion) VALUES
            {perm_rows}
        """
    )

    # ── preset roles (tenant_id NULL, es_preset true) ──
    role_rows = ",\n            ".join(
        f"(NULL, {_q(nombre)}, {_q(vert)}, true, {_q(desc)})"
        for nombre, vert, desc in PRESET_ROLES
    )
    op.execute(
        f"""
        INSERT INTO roles (tenant_id, nombre, vertical, es_preset, descripcion) VALUES
            {role_rows}
        """
    )

    # ── assignments: one INSERT ... SELECT joining preset roles by nombre ──
    pairs = []
    for role_nombre, perm_ids in ROLE_ASSIGNMENTS.items():
        for pid in perm_ids:
            # escape single quotes defensively (none expected in fixed ids)
            pairs.append(f"('{role_nombre}', '{pid}')")
    values_sql = ",\n            ".join(pairs)
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, v.permission_id
        FROM (VALUES
            {values_sql}
        ) AS v(role_nombre, permission_id)
        JOIN roles r
          ON r.nombre = v.role_nombre
         AND r.es_preset = true
         AND r.tenant_id IS NULL
        """
    )


def downgrade() -> None:
    role_names = [r[0] for r in PRESET_ROLES]
    perm_ids = [p[0] for p in ALL_PERMISSIONS]
    in_roles = ",".join(f"'{n}'" for n in role_names)
    in_perms = ",".join(f"'{p}'" for p in perm_ids)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id FROM roles WHERE es_preset = true AND tenant_id IS NULL
              AND nombre IN ({in_roles})
        )
        """
    )
    op.execute(
        f"DELETE FROM roles WHERE es_preset = true AND tenant_id IS NULL AND nombre IN ({in_roles})"
    )
    op.execute(f"DELETE FROM permissions WHERE id IN ({in_perms})")


def _q(value) -> str:
    """SQL literal for a fixed-catalog string (or NULL). Escapes quotes."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"
