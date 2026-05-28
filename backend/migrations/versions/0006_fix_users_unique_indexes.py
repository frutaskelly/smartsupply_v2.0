"""fix users redundant unique constraint + plain index drift

Revision ID: 0006_fix_users_unique_indexes
Revises: 0005_seed_catalog_perms
Create Date: 2026-05-29

Migration 0002 created `users.email` / `users.auth_user_id` with BOTH
`unique=True` (which emitted the unique constraints `users_email_key` /
`users_auth_user_id_key`) AND a separate non-unique index
(`ix_users_email` / `ix_users_auth_user_id`). The SQLAlchemy model declares
`unique=True, index=True`, which SQLAlchemy reads as a SINGLE *unique* index
named `ix_users_*`. So the DB carried a redundant double index per column and
`alembic check` flagged drift.

This collapses each pair into the single unique index the model expects:
drop the unique constraint + the plain index, then recreate `ix_users_*` as a
UNIQUE index. 0002 is left untouched (already deployed to the cloud); this is a
forward-only correction. Raw SQL with IF EXISTS guards so it renders offline
(`alembic upgrade --sql`) and is safe to re-run.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006_fix_users_unique_indexes"
down_revision: Union[str, None] = "0005_seed_catalog_perms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the redundant unique constraints (each owns its own implicit index)
    # and the separate non-unique indexes...
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key")
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_auth_user_id_key")
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute("DROP INDEX IF EXISTS ix_users_auth_user_id")

    # ...and recreate the single UNIQUE index per column that the model declares.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_auth_user_id ON users (auth_user_id)")


def downgrade() -> None:
    # Restore the prior (0002) state: unique constraint + non-unique index.
    op.execute("DROP INDEX IF EXISTS ix_users_email")
    op.execute("DROP INDEX IF EXISTS ix_users_auth_user_id")
    op.execute("ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)")
    op.execute("ALTER TABLE users ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_email ON users (email)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_users_auth_user_id ON users (auth_user_id)")
