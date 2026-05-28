"""RLS isolation on the Phase 3 catalog tables.

Same guarantee as test_rls.py (tenant data is invisible across tenants for the
app_user role), exercised on a tenant-scoped catalog table (`productos`) and on
`precios` — which carries its OWN tenant_id rather than relying on a join, so it
must isolate on its own policy.
"""
import uuid

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
            "sa": f"cat-a-{tid_a[:8]}", "sb": f"cat-b-{tid_b[:8]}",
            "ra": f"CA{tid_a[:9].upper()}", "rb": f"CB{tid_b[:9].upper()}",
        },
    )


def _seed_producto(conn, tenant_id, sku):
    pid = str(uuid.uuid4())
    conn.execute(
        text(
            """
            INSERT INTO productos (id, tenant_id, sku, nombre, clave_sat, unidad_sat)
            VALUES (:id, :t, :sku, :nom, '01010101', 'KGM')
            """
        ),
        {"id": pid, "t": tenant_id, "sku": sku, "nom": f"Prod {sku}"},
    )
    return pid


def test_productos_isolated_by_tenant(db_engine):
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    with db_engine.begin() as conn:
        _seed_tenants(conn, tid_a, tid_b)
        _seed_producto(conn, tid_a, "A-1")
        _seed_producto(conn, tid_b, "B-1")

    try:
        with db_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("SET LOCAL ROLE app_user"))

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})
            skus = sorted(r[0] for r in conn.execute(text("SELECT sku FROM productos")))
            assert skus == ["A-1"], f"tenant A must see only its product, got {skus}"

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_b})
            skus = sorted(r[0] for r in conn.execute(text("SELECT sku FROM productos")))
            assert skus == ["B-1"], f"tenant B must see only its product, got {skus}"

            # No scope → fail closed.
            conn.execute(text("SELECT set_config('app.current_tenant_id', '', true)"))
            count = conn.execute(text("SELECT count(*) FROM productos")).scalar()
            assert count == 0, "no-GUC must expose no products"

            trans.rollback()
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})


def test_precios_isolated_on_own_tenant_id(db_engine):
    """`precios` has its own tenant_id; verify its policy isolates independently."""
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    with db_engine.begin() as conn:
        _seed_tenants(conn, tid_a, tid_b)
        prod_a = _seed_producto(conn, tid_a, "A-1")
        prod_b = _seed_producto(conn, tid_b, "B-1")
        for tid, prod, codigo in ((tid_a, prod_a, "LA"), (tid_b, prod_b, "LB")):
            lista = str(uuid.uuid4())
            conn.execute(
                text(
                    """
                    INSERT INTO listas_precios (id, tenant_id, codigo, nombre)
                    VALUES (:id, :t, :c, :n)
                    """
                ),
                {"id": lista, "t": tid, "c": codigo, "n": f"Lista {codigo}"},
            )
            conn.execute(
                text(
                    """
                    INSERT INTO precios (id, tenant_id, lista_id, producto_id, precio_unitario)
                    VALUES (:id, :t, :l, :p, 99.50)
                    """
                ),
                {"id": str(uuid.uuid4()), "t": tid, "l": lista, "p": prod},
            )

    try:
        with db_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("SET LOCAL ROLE app_user"))

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})
            assert conn.execute(text("SELECT count(*) FROM precios")).scalar() == 1

            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_b})
            visible = {str(r[0]) for r in conn.execute(text("SELECT tenant_id FROM precios"))}
            assert visible == {tid_b}, f"tenant B must see only its prices, got {visible}"

            trans.rollback()
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})
