"""facturas + lineas_factura (CFDI 4.0), remision.factura_id, permiso factura:gestionar

Revision ID: 0017_facturas
Revises: 0016_drop_producto_costo
Create Date: 2026-05-30

Fase 6 (fiscal). Una factura agrupa el desglose CFDI 4.0 calculado (IVA/IEPS/
retenciones por concepto) y, tras timbrar, el UUID/XML/PDF. Cruza una o varias
remisiones (remision.factura_id). El timbrado real (Facturama) llega en P6.2;
aquí solo el documento + cálculo. RLS uniforme por tenant.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017_facturas"
down_revision: Union[str, None] = "0016_drop_producto_costo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("facturas", "lineas_factura")

factura_estado = postgresql.ENUM(
    "BORRADOR", "TIMBRADA", "CANCELADA", name="factura_estado", create_type=False
)

PERMS = [("factura:gestionar", "factura", "gestionar", None, "Generar/timbrar/cancelar facturas")]
ROLE_GRANTS = {"ADMIN": ["factura:gestionar"], "FACTURISTA": ["factura:gestionar"]}


def _tenant_col():
    return sa.Column(
        "tenant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )


def upgrade() -> None:
    factura_estado.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "facturas",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("serie", sa.String(10), nullable=False, server_default="F"),
        sa.Column("folio", sa.Integer, nullable=False),
        sa.Column("cliente_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("uso_cfdi", sa.String(5), nullable=False, server_default="G03"),
        sa.Column("forma_pago", sa.String(5), nullable=False, server_default="99"),
        sa.Column("metodo_pago", sa.String(5), nullable=False, server_default="PUE"),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="MXN"),
        sa.Column("tipo_comprobante", sa.String(1), nullable=False, server_default="I"),
        sa.Column("lugar_expedicion", sa.String(5)),
        sa.Column("fecha", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("descuento", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("iva_trasladado", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ieps_trasladado", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ret_iva", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ret_isr", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("estado", factura_estado, nullable=False, server_default="BORRADOR"),
        sa.Column("uuid", sa.String(36)),
        sa.Column("facturama_id", sa.String(40)),
        sa.Column("fecha_timbrado", sa.DateTime(timezone=True)),
        sa.Column("xml", sa.Text),
        sa.Column("pdf_url", sa.Text),
        sa.Column("notas", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "serie", "folio", name="uq_factura_tenant_serie_folio"),
    )
    op.create_index("ix_facturas_tenant_id", "facturas", ["tenant_id"])
    op.create_index("ix_facturas_cliente", "facturas", ["cliente_id"])
    op.create_index("ix_facturas_estado", "facturas", ["estado"])

    op.create_table(
        "lineas_factura",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facturas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero_linea", sa.SmallInteger, nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("clave_prod_serv", sa.String(8), nullable=False),
        sa.Column("clave_unidad", sa.String(3), nullable=False),
        sa.Column("descripcion", sa.String(1000), nullable=False),
        sa.Column("cantidad", sa.Numeric(18, 6), nullable=False),
        sa.Column("valor_unitario", sa.Numeric(18, 6), nullable=False),
        sa.Column("importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("descuento", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("objeto_imp", sa.String(2), nullable=False, server_default="02"),
        sa.Column("iva_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("iva_importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ieps_tipo", sa.String(10)),
        sa.Column("ieps_valor", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("ieps_importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ret_iva_importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ret_isr_importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.UniqueConstraint("factura_id", "numero_linea", name="uq_linea_factura_numero"),
    )
    op.create_index("ix_lineas_factura_tenant_id", "lineas_factura", ["tenant_id"])
    op.create_index("ix_lineas_factura_factura_id", "lineas_factura", ["factura_id"])

    op.add_column(
        "remisiones",
        sa.Column("factura_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("facturas.id", ondelete="SET NULL")),
    )

    for table in _TENANT_SCOPED:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                USING (tenant_id = public.current_tenant_id())
            """
        )

    # permiso factura:gestionar + grants a ADMIN / FACTURISTA (preset)
    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})"
        for pid, rec, acc, vert, desc in PERMS
    )
    op.execute(f"INSERT INTO permissions (id, recurso, accion, vertical, descripcion) VALUES {perm_rows}")
    pairs = [f"('{rol}', '{pid}')" for rol, pids in ROLE_GRANTS.items() for pid in pids]
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, v.permission_id
        FROM (VALUES {",".join(pairs)}) AS v(role_nombre, permission_id)
        JOIN roles r ON r.nombre = v.role_nombre AND r.es_preset = true AND r.tenant_id IS NULL
        """
    )


def downgrade() -> None:
    perm_ids = [p[0] for p in PERMS]
    in_perms = ",".join(f"'{p}'" for p in perm_ids)
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({in_perms})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({in_perms})")
    op.drop_column("remisiones", "factura_id")
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("lineas_factura")
    op.drop_table("facturas")
    factura_estado.drop(op.get_bind(), checkfirst=True)


def _q(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"
