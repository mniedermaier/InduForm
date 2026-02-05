"""Add indexes to frequently-queried foreign key columns.

Revision ID: 003_indexes
Revises: 002_tokens
Create Date: 2026-02-11

"""
from typing import Sequence, Union

from alembic import op

revision: str = "003_indexes"
down_revision: Union[str, None] = "002_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("teams") as batch_op:
        batch_op.create_index("ix_teams_created_by", ["created_by"])

    with op.batch_alter_table("projects") as batch_op:
        batch_op.create_index("ix_projects_owner_id", ["owner_id"])

    with op.batch_alter_table("project_access") as batch_op:
        batch_op.create_index("ix_project_access_project_id", ["project_id"])
        batch_op.create_index("ix_project_access_user_id", ["user_id"])
        batch_op.create_index("ix_project_access_team_id", ["team_id"])

    with op.batch_alter_table("zones") as batch_op:
        batch_op.create_index("ix_zones_project_id", ["project_id"])

    with op.batch_alter_table("assets") as batch_op:
        batch_op.create_index("ix_assets_zone_db_id", ["zone_db_id"])

    with op.batch_alter_table("conduits") as batch_op:
        batch_op.create_index("ix_conduits_project_id", ["project_id"])
        batch_op.create_index("ix_conduits_from_zone_db_id", ["from_zone_db_id"])
        batch_op.create_index("ix_conduits_to_zone_db_id", ["to_zone_db_id"])

    with op.batch_alter_table("protocol_flows") as batch_op:
        batch_op.create_index("ix_protocol_flows_conduit_id", ["conduit_id"])

    with op.batch_alter_table("comments") as batch_op:
        batch_op.create_index("ix_comments_project_id", ["project_id"])
        batch_op.create_index("ix_comments_author_id", ["author_id"])

    with op.batch_alter_table("nmap_scans") as batch_op:
        batch_op.create_index("ix_nmap_scans_project_id", ["project_id"])
        batch_op.create_index("ix_nmap_scans_uploaded_by", ["uploaded_by"])

    with op.batch_alter_table("nmap_hosts") as batch_op:
        batch_op.create_index("ix_nmap_hosts_scan_id", ["scan_id"])

    with op.batch_alter_table("templates") as batch_op:
        batch_op.create_index("ix_templates_owner_id", ["owner_id"])

    with op.batch_alter_table("activity_logs") as batch_op:
        batch_op.create_index("ix_activity_logs_project_id", ["project_id"])
        batch_op.create_index("ix_activity_logs_user_id", ["user_id"])


def downgrade() -> None:
    with op.batch_alter_table("activity_logs") as batch_op:
        batch_op.drop_index("ix_activity_logs_user_id")
        batch_op.drop_index("ix_activity_logs_project_id")

    with op.batch_alter_table("templates") as batch_op:
        batch_op.drop_index("ix_templates_owner_id")

    with op.batch_alter_table("nmap_hosts") as batch_op:
        batch_op.drop_index("ix_nmap_hosts_scan_id")

    with op.batch_alter_table("nmap_scans") as batch_op:
        batch_op.drop_index("ix_nmap_scans_uploaded_by")
        batch_op.drop_index("ix_nmap_scans_project_id")

    with op.batch_alter_table("comments") as batch_op:
        batch_op.drop_index("ix_comments_author_id")
        batch_op.drop_index("ix_comments_project_id")

    with op.batch_alter_table("protocol_flows") as batch_op:
        batch_op.drop_index("ix_protocol_flows_conduit_id")

    with op.batch_alter_table("conduits") as batch_op:
        batch_op.drop_index("ix_conduits_to_zone_db_id")
        batch_op.drop_index("ix_conduits_from_zone_db_id")
        batch_op.drop_index("ix_conduits_project_id")

    with op.batch_alter_table("assets") as batch_op:
        batch_op.drop_index("ix_assets_zone_db_id")

    with op.batch_alter_table("zones") as batch_op:
        batch_op.drop_index("ix_zones_project_id")

    with op.batch_alter_table("project_access") as batch_op:
        batch_op.drop_index("ix_project_access_team_id")
        batch_op.drop_index("ix_project_access_user_id")
        batch_op.drop_index("ix_project_access_project_id")

    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_index("ix_projects_owner_id")

    with op.batch_alter_table("teams") as batch_op:
        batch_op.drop_index("ix_teams_created_by")
