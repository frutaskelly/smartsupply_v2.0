"""seed operaciones-management permissions + assign to roles

Revision ID: 0007_seed_operaciones_perms
Revises: 0006_fix_users_unique_indexes
Create Date: 2026-05-29

Phase 4 authorization. The *read* side already exists from 0003 as menu
permissions (`menu:inventario`, `menu:compras`, `menu:remisiones`,
`menu:conversiones`) — a role that can see those menus can already read the
operaciones data. This adds the stronger `:gestionar` action permissions for
writing, and grants them.

Seeded first (before the schema migrations 0008+) so every operaciones
sub-step is testable on its own: ADMIN holds every management right from the
moment the tables land. OWNER bypasses in code (no rows).

Granted to ADMIN (everything) and CAPTURISTA_GOV (remisiones + conversiones —
that role exists precisely to capture them). Other scoped roles read but don't
manage, matching the Phase 3 precedent (0005).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007_seed_operaciones_perms"
down_revision: Union[str, None] = "0006_fix_users_unique_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (id, recurso, accion, vertical, descripcion)
OPERACIONES_PERMISSIONS = [
    ("proveedor:gestionar", "proveedor", "gestionar", None, "Gestionar proveedores"),
    ("almacen:gestionar", "almacen", "gestionar", None, "Gestionar almacenes"),
    ("inventario:gestionar", "inventario", "gestionar", None, "Registrar movimientos de inventario"),
    ("compra:gestionar", "compra", "gestionar", None, "Crear/editar/recibir órdenes de compra"),
    ("conversion:gestionar", "conversion", "gestionar", None, "Gestionar conversiones de producto"),
    ("remision:gestionar", "remision", "gestionar", None, "Crear/editar/cancelar remisiones"),
]

ROLE_ASSIGNMENTS = {
    "ADMIN": [p[0] for p in OPERACIONES_PERMISSIONS],
    "CAPTURISTA_GOV": ["remision:gestionar", "conversion:gestionar"],
}


def upgrade() -> None:
    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})"
        for pid, rec, acc, vert, desc in OPERACIONES_PERMISSIONS
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
    perm_ids = [p[0] for p in OPERACIONES_PERMISSIONS]
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
