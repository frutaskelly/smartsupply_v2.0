"""seed IAM-admin permissions (roles + memberships) + assign to ADMIN

Revision ID: 0014_seed_iam_admin_perms
Revises: 0013_producto_unidad_base
Create Date: 2026-05-30

The *read* side already exists from 0003 as menu permissions
(`menu:ajustes.roles`, `menu:ajustes.usuarios`). This adds the `:gestionar`
action permissions that gate writing custom roles, setting their permissions,
and managing memberships (assigning a user a role in the tenant).

Granted to ADMIN. OWNER bypasses in code (no rows). Preset roles stay
read-only — the admin API forbids mutating them — so these permissions only
ever act on a tenant's own custom roles and its own memberships.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014_seed_iam_admin_perms"
down_revision: Union[str, None] = "0013_producto_unidad_base"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (id, recurso, accion, vertical, descripcion)
IAM_ADMIN_PERMISSIONS = [
    ("role:gestionar", "role", "gestionar", None, "Crear/editar roles personalizados y sus permisos"),
    ("membership:gestionar", "membership", "gestionar", None, "Asignar roles a usuarios del inquilino"),
]

ROLE_ASSIGNMENTS = {
    "ADMIN": [p[0] for p in IAM_ADMIN_PERMISSIONS],
}


def upgrade() -> None:
    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})"
        for pid, rec, acc, vert, desc in IAM_ADMIN_PERMISSIONS
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
    perm_ids = [p[0] for p in IAM_ADMIN_PERMISSIONS]
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
