"""Add URL columns

Revision ID: a17525d43df5
Revises: 
Create Date: 2025-01-31 16:39:10.581271

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a17525d43df5'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('meal', schema=None) as batch_op:
        batch_op.add_column(sa.Column('person1_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('person2_url', sa.String(length=500), nullable=True))

    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    with op.batch_alter_table('meal', schema=None) as batch_op:
        batch_op.drop_column('person2_url')
        batch_op.drop_column('person1_url')

    # ### end Alembic commands ###
