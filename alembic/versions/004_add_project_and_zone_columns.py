"""Add compliance_standards, allowed_protocols columns to projects and
x_position, y_position columns to zones.

These were previously applied as ad-hoc startup migrations in database.py
and are now consolidated into a proper Alembic revision.

Revision ID: 004_columns
Revises: 003_indexes
Create Date: 2026-02-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "004_columns"
down_revision: Union[str, None] = "003_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in a table (works for SQLite and PostgreSQL)."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = [c["name"] for c in inspector.get_columns(table)]
    return column in columns


def upgrade() -> None:
    # Projects: compliance_standards
    if not _column_exists("projects", "compliance_standards"):
        with op.batch_alter_table("projects") as batch_op:
            batch_op.add_column(sa.Column("compliance_standards", sa.Text(), nullable=True))
        # Populate from standard column where compliance_standards is NULL
        op.execute(
            "UPDATE projects SET compliance_standards = '[\"' || standard || '\"]' "
            "WHERE compliance_standards IS NULL"
        )

    # Projects: allowed_protocols
    if not _column_exists("projects", "allowed_protocols"):
        with op.batch_alter_table("projects") as batch_op:
            batch_op.add_column(sa.Column("allowed_protocols", sa.Text(), nullable=True))
        op.execute("UPDATE projects SET allowed_protocols = '[]' WHERE allowed_protocols IS NULL")

    # Zones: x_position and y_position
    if not _column_exists("zones", "x_position"):
        with op.batch_alter_table("zones") as batch_op:
            batch_op.add_column(sa.Column("x_position", sa.Float(), nullable=True))
            batch_op.add_column(sa.Column("y_position", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("zones") as batch_op:
        batch_op.drop_column("y_position")
        batch_op.drop_column("x_position")

    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_column("allowed_protocols")
        batch_op.drop_column("compliance_standards")
