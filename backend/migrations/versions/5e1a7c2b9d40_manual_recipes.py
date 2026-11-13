"""recipes written by hand: source_url optional

Revision ID: 5e1a7c2b9d40
Revises: 8c7ccf84c5b8
Create Date: 2026-11-13 15:30:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5e1a7c2b9d40'
down_revision = '8c7ccf84c5b8'
branch_labels = None
depends_on = None


def upgrade():
    # SQLite can't alter a column in place; batch mode copies the table.
    with op.batch_alter_table('recipe') as batch_op:
        batch_op.alter_column('source_url', existing_type=sa.String(length=500), nullable=True)


def downgrade():
    # Hand-written recipes have no source; they can't exist in the old schema.
    op.execute("DELETE FROM recipe WHERE source_url IS NULL")
    with op.batch_alter_table('recipe') as batch_op:
        batch_op.alter_column('source_url', existing_type=sa.String(length=500), nullable=False)
