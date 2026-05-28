"""seed catalog-management permissions + assign to ADMIN

Revision ID: 0005_seed_catalog_perms
Revises: 0004_catalog_schema_rls
Create Date: 2026-05-28

Phase 3 authorization. `menu:*` permissions (from 0003) gate *visibility* and
read access — a TOMADOR can already see `menu:productos`/`menu:clientes` to
look things up while taking an order. Writing to the catalog is a separate,
stronger right: these `:gestionar` action permissions.

Granted to ADMIN. OWNER bypasses the catalog in code (no rows). The scoped POS
roles deliberately get none of these — they read the catalog, they don't
manage it.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_seed_catalog_perms"
down_revision: Union[str, None] = "0004_catalog_schema_rls"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (id, recurso, accion, vertical, descripcion)
CATALOG_PERMISSIONS = [
    ("categoria:gestionar", "categoria", "gestionar", None, "Gestionar categorías de productos"),
    ("esquema_impuesto:gestionar", "esquema_impuesto", "gestionar", None, "Gestionar esquemas de impuesto"),
    ("producto:gestionar", "producto", "gestionar", None, "Crear/editar/eliminar productos del catálogo"),
    ("lista_precios:gestionar", "lista_precios", "gestionar", None, "Gestionar listas de precios y sus precios"),
    ("cliente:gestionar", "cliente", "gestionar", None, "Crear/editar/eliminar clientes"),
]

# Every catalog-management permission goes to ADMIN.
ROLE_ASSIGNMENTS = {
    "ADMIN": [p[0] for p in CATALOG_PERMISSIONS],
}


def upgrade() -> None:
    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})"
        for pid, rec, acc, vert, desc in CATALOG_PERMISSIONS
    )
    op.execute(
        f"""
        INSERT INTO permissions (id, recurso, accion, vertical, descripcion) VALUES
            {perm_rows}
        """
    )

    pairs = []
    for role_nombre, perm_ids in ROLE_ASSIGNMENTS.items():
        for pid in perm_ids:
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
    perm_ids = [p[0] for p in CATALOG_PERMISSIONS]
    in_perms = ",".join(f"'{p}'" for p in perm_ids)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN ({in_perms})
          AND role_id IN (
            SELECT id FROM roles WHERE es_preset = true AND tenant_id IS NULL
          )
        """
    )
    op.execute(f"DELETE FROM permissions WHERE id IN ({in_perms})")


def _q(value) -> str:
    """SQL literal for a fixed-catalog string (or NULL). Escapes quotes."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"
