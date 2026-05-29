"""RLS isolation on the Phase 4 operaciones tables.

Same contract as the catalog (test_catalog_rls.py): under the app_user role a
tenant sees only its own rows, the no-scope case fails closed, and the policy's
USING clause doubles as the INSERT WITH CHECK so a row can't be planted under a
foreign tenant_id. Exercised on `proveedores`; the policy is identical on every
operaciones table.
"""
import uuid

import pytest
from sqlalchemy import text


def _seed_tenants(conn, tid_a, tid_b):
    conn.execute(
        text(
            """
            INSERT INTO tenants (id, slug, legal_name, rfc, regimen_fiscal_sat, domicilio_fiscal_cp, tier, status)
            VALUES
              (:a, :sa, 'A SA', :ra, '601', '01000', 'PRINCIPAL', 'ACTIVE'),
              (:b, :sb, 'B SA', :rb, '601', '02000', 'PRINCIPAL', 'ACTIVE')
            """
        ),
        {
            "a": tid_a, "b": tid_b,
            "sa": f"ops-a-{tid_a[:8]}", "sb": f"ops-b-{tid_b[:8]}",
            "ra": f"OA{tid_a[:9].upper()}", "rb": f"OB{tid_b[:9].upper()}",
        },
    )


def _seed_proveedor(conn, tenant_id, codigo):
    conn.execute(
        text(
            """
            INSERT INTO proveedores (id, tenant_id, codigo, nombre)
            VALUES (:id, :t, :c, :n)
            """
        ),
        {"id": str(uuid.uuid4()), "t": tenant_id, "c": codigo, "n": f"Prov {codigo}"},
    )


def test_proveedores_isolated_by_tenant(db_engine):
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    with db_engine.begin() as conn:
        _seed_tenants(conn, tid_a, tid_b)
        _seed_proveedor(conn, tid_a, "A-1")
        _seed_proveedor(conn, tid_b, "B-1")

    try:
        with db_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("SET LOCAL ROLE app_user"))

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})
            codes = sorted(r[0] for r in conn.execute(text("SELECT codigo FROM proveedores")))
            assert codes == ["A-1"], f"tenant A must see only its supplier, got {codes}"

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_b})
            codes = sorted(r[0] for r in conn.execute(text("SELECT codigo FROM proveedores")))
            assert codes == ["B-1"], f"tenant B must see only its supplier, got {codes}"

            # No scope → fail closed.
            conn.execute(text("SELECT set_config('app.current_tenant_id', '', true)"))
            count = conn.execute(text("SELECT count(*) FROM proveedores")).scalar()
            assert count == 0, "no-GUC must expose no suppliers"

            trans.rollback()
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})


def test_insert_with_foreign_tenant_id_is_blocked(db_engine):
    """Under tenant A's scope, planting a proveedor tagged tenant B is rejected
    by the policy's implied WITH CHECK."""
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    with db_engine.begin() as conn:
        _seed_tenants(conn, tid_a, tid_b)

    try:
        with db_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("SET LOCAL ROLE app_user"))
            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})

            with pytest.raises(Exception) as exc:
                conn.execute(
                    text(
                        """
                        INSERT INTO proveedores (id, tenant_id, codigo, nombre)
                        VALUES (:id, :t, 'X', 'X')
                        """
                    ),
                    {"id": str(uuid.uuid4()), "t": tid_b},
                )
            assert "row-level security" in str(exc.value).lower()
            trans.rollback()
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})
