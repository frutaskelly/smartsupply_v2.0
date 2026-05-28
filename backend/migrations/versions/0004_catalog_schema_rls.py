"""catalog schema + RLS (productos, categorias, esquemas, listas/precios, clientes)

Revision ID: 0004_catalog_schema_rls
Revises: 0003_seed_iam
Create Date: 2026-05-28

Phase 3 — the catálogo (master data). Six tenant-scoped tables, each isolated
by the same RLS contract established in 0002: a single policy keyed on
`tenant_id = public.current_tenant_id()`. Unlike v1, `precios` carries its own
`tenant_id` so the policy is uniform across every table (no join-to-parent for
isolation).

app_user already holds default privileges (see 0002's ALTER DEFAULT
PRIVILEGES), so new tables inherit grants automatically; we still GRANT
explicitly here as defense in depth in case migrations run under a role that
didn't set those defaults.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_catalog_schema_rls"
down_revision: Union[str, None] = "0003_seed_iam"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


cliente_tipo = postgresql.ENUM(
    "PRINCIPAL_GOV", "SUB", "PRIVADO", "OTRO", name="cliente_tipo", create_type=False
)

# All carry tenant_id directly → one uniform isolation policy.
_TENANT_SCOPED = (
    "categorias_producto",
    "esquemas_impuesto",
    "productos",
    "listas_precios",
    "precios",
    "clientes",
)


def _audit_cols():
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def _tenant_col():
    return sa.Column(
        "tenant_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def upgrade() -> None:
    bind = op.get_bind()
    cliente_tipo.create(bind, checkfirst=True)

    # ─── categorias_producto ─────────────────────────────────────────────────
    op.create_table(
        "categorias_producto",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(10), nullable=False),
        sa.Column("nombre", sa.String(100), nullable=False),
        sa.Column("descripcion", sa.Text),
        sa.Column("color", sa.String(7)),
        sa.Column("orden", sa.Integer, nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_categoria_tenant_codigo"),
    )
    op.create_index("ix_categorias_producto_tenant_id", "categorias_producto", ["tenant_id"])
    op.create_index("ix_categorias_producto_codigo", "categorias_producto", ["codigo"])

    # ─── esquemas_impuesto ───────────────────────────────────────────────────
    op.create_table(
        "esquemas_impuesto",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(10), nullable=False),
        sa.Column("nombre", sa.String(120), nullable=False),
        sa.Column("descripcion", sa.Text),
        sa.Column("iva_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("ieps_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("iva_exento", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("retencion_iva_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("retencion_isr_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_esquema_tenant_codigo"),
    )
    op.create_index("ix_esquemas_impuesto_tenant_id", "esquemas_impuesto", ["tenant_id"])
    op.create_index("ix_esquemas_impuesto_codigo", "esquemas_impuesto", ["codigo"])

    # ─── productos ───────────────────────────────────────────────────────────
    op.create_table(
        "productos",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("sku", sa.String(50), nullable=False),
        sa.Column("nombre", sa.String(254), nullable=False),
        sa.Column("descripcion", sa.Text),
        sa.Column("categoria_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categorias_producto.id", ondelete="SET NULL"), nullable=True),
        sa.Column("esquema_impuesto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("esquemas_impuesto.id", ondelete="SET NULL"), nullable=True),
        sa.Column("clave_sat", sa.String(8), nullable=False),
        sa.Column("unidad_sat", sa.String(3), nullable=False),
        sa.Column("objeto_imp", sa.String(2), nullable=False, server_default="02"),
        sa.Column("iva_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("ieps_tasa", sa.Numeric(5, 4), nullable=False, server_default="0"),
        sa.Column("presentaciones", postgresql.JSONB, nullable=False, server_default=sa.text("""'{"KILO": 1}'::jsonb""")),
        sa.Column("presentacion_default", sa.String(20), server_default="KILO"),
        sa.Column("unidad_entrada", sa.String(20)),
        sa.Column("unidad_salida", sa.String(20)),
        sa.Column("perecedero", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("cold_chain", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("requiere_lote", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("requiere_caducidad", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("vida_util_dias", sa.Integer),
        sa.Column("costo_promedio", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("sinonimos", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("custom_fields", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "sku", name="uq_producto_tenant_sku"),
    )
    op.create_index("ix_productos_tenant_id", "productos", ["tenant_id"])
    op.create_index("ix_productos_categoria_id", "productos", ["categoria_id"])
    op.create_index("ix_productos_esquema_impuesto_id", "productos", ["esquema_impuesto_id"])

    # ─── listas_precios ──────────────────────────────────────────────────────
    op.create_table(
        "listas_precios",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(20), nullable=False),
        sa.Column("nombre", sa.String(254), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVO"),
        sa.Column("vigencia_desde", sa.Date),
        sa.Column("vigencia_hasta", sa.Date),
        sa.Column("moneda", sa.String(3), nullable=False, server_default="MXN"),
        sa.Column("notas", sa.Text),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_lista_tenant_codigo"),
    )
    op.create_index("ix_listas_precios_tenant_id", "listas_precios", ["tenant_id"])

    # ─── precios (tiered; own tenant_id for uniform RLS) ─────────────────────
    op.create_table(
        "precios",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("lista_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("listas_precios.id", ondelete="CASCADE"), nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("presentacion", sa.String(20), nullable=False, server_default="KILO"),
        sa.Column("precio_unitario", sa.Numeric(18, 4), nullable=False),
        sa.Column("cantidad_minima", sa.Integer, nullable=False, server_default="1"),
        sa.Column("vigencia_desde", sa.Date),
        sa.Column("vigencia_hasta", sa.Date),
        sa.UniqueConstraint("lista_id", "producto_id", "presentacion", "cantidad_minima", name="uq_precio_lista_prod_pres_qty"),
    )
    op.create_index("ix_precios_tenant_id", "precios", ["tenant_id"])
    op.create_index("ix_precios_lista_id", "precios", ["lista_id"])
    op.create_index("ix_precios_producto_id", "precios", ["producto_id"])
    op.create_index("ix_precios_lookup", "precios", ["lista_id", "producto_id", "presentacion", "cantidad_minima"])

    # ─── clientes ────────────────────────────────────────────────────────────
    op.create_table(
        "clientes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(20)),
        sa.Column("tipo", cliente_tipo, nullable=False, server_default="PRIVADO"),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVO"),
        sa.Column("legal_name", sa.String(254), nullable=False),
        sa.Column("rfc", sa.String(15), nullable=False),
        sa.Column("regimen_fiscal", sa.String(4)),
        sa.Column("uso_cfdi_default", sa.String(5)),
        sa.Column("forma_pago_default", sa.String(5)),
        sa.Column("metodo_pago_default", sa.String(5)),
        sa.Column("domicilio_fiscal", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("lista_precios_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("listas_precios.id", ondelete="SET NULL"), nullable=True),
        sa.Column("condiciones_pago", sa.String(50)),
        sa.Column("limite_credito", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("dias_credito", sa.Integer, nullable=False, server_default="0"),
        sa.Column("descuento_default", sa.Numeric(5, 2), nullable=False, server_default="0"),
        sa.Column("config_addenda", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("saldo_actual", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ventas_ytd", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ultima_venta_at", sa.DateTime(timezone=True)),
        sa.Column("ultimo_pago_at", sa.DateTime(timezone=True)),
        sa.Column("custom_fields", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        *_audit_cols(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_cliente_tenant_codigo"),
    )
    op.create_index("ix_clientes_tenant_id", "clientes", ["tenant_id"])
    op.create_index("ix_clientes_rfc", "clientes", ["rfc"])

    # ─── grants + RLS ────────────────────────────────────────────────────────
    for table in _TENANT_SCOPED:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                USING (tenant_id = public.current_tenant_id())
            """
        )


def downgrade() -> None:
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    # Drop in FK-dependency order.
    op.drop_table("clientes")
    op.drop_table("precios")
    op.drop_table("listas_precios")
    op.drop_table("productos")
    op.drop_table("esquemas_impuesto")
    op.drop_table("categorias_producto")

    cliente_tipo.drop(op.get_bind(), checkfirst=True)
