"""The auth gate must reject anyone without a valid Supabase JWT.

This is the v2 security cornerstone: no endpoint trusts a header for identity.
"""


def test_me_requires_bearer(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_rejects_garbage_token(client):
    # Not a JWT at all → header parse fails before any network/JWKS fetch.
    r = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert r.status_code == 401
