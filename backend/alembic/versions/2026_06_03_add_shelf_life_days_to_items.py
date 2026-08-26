"""Add shelf_life_days column to items table

Revision ID: a1b2c3d4e5f6
Revises: 0b2ea9c892af
Create Date: 2026-06-03 21:50:00.000000+07:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '55078f2016b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('items', sa.Column('shelf_life_days', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('items', 'shelf_life_days')
