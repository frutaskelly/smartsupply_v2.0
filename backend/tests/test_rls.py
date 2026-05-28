"""Postgres RLS must isolate tenants for the app_user role.

This is the database-level half of v2's security model: even if application
code forgets a tenant filter, the DB returns nothing from another tenant.
"""
import uuid

from sqlalchemy import text


def _seed(conn, tid_a, tid_b):
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
            "sa": f"rls-a-{tid_a[:8]}", "sb": f"rls-b-{tid_b[:8]}",
            "ra": f"RA{tid_a[:9].upper()}", "rb": f"RB{tid_b[:9].upper()}",
        },
    )


def test_app_user_sees_only_current_tenant(db_engine):
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())

    with db_engine.begin() as conn:
        _seed(conn, tid_a, tid_b)

    try:
        with db_engine.connect() as conn:
            trans = conn.begin()
            conn.execute(text("SET LOCAL ROLE app_user"))

            # Scoped to A.
            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})
            visible = [r[0] for r in conn.execute(text("SELECT id::text FROM tenants"))]
            assert visible == [tid_a], f"expected only A, got {visible}"

            # Scoped to B.
            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_b})
            visible = [r[0] for r in conn.execute(text("SELECT id::text FROM tenants"))]
            assert visible == [tid_b], f"expected only B, got {visible}"

            # No tenant scope → fail closed (zero rows).
            conn.execute(text("SELECT set_config('app.current_tenant_id', '', true)"))
            count = conn.execute(text("SELECT count(*) FROM tenants")).scalar()
            assert count == 0, "no-GUC must expose no tenants"

            # Preset roles (tenant_id NULL) remain readable regardless of scope.
            preset = conn.execute(
                text("SELECT count(*) FROM roles WHERE es_preset AND tenant_id IS NULL")
            ).scalar()
            assert preset >= 10

            trans.rollback()
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})


def test_owner_role_bypasses_rls_for_resolution(db_engine):
    """The connection role (owner) must still see across tenants — that is how
    the pre-tenant auth-resolution step reads a user's memberships."""
    tid_a = str(uuid.uuid4())
    tid_b = str(uuid.uuid4())
    with db_engine.begin() as conn:
        _seed(conn, tid_a, tid_b)
    try:
        with db_engine.connect() as conn:
            # No SET ROLE: still the owner/superuser → RLS bypassed.
            conn.execute(text("SELECT set_config('app.current_tenant_id', :t, true)"), {"t": tid_a})
            visible = {r[0] for r in conn.execute(text("SELECT id::text FROM tenants WHERE id IN (:a,:b)"), {"a": tid_a, "b": tid_b})}
            assert visible == {tid_a, tid_b}
    finally:
        with db_engine.begin() as conn:
            conn.execute(text("DELETE FROM tenants WHERE id IN (:a, :b)"), {"a": tid_a, "b": tid_b})
