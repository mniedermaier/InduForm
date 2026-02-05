"""Initial schema - baseline migration matching existing models.

Revision ID: 001_initial
Revises: None
Create Date: 2026-02-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("username", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(255)),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
        sa.Column("is_active", sa.Boolean, default=True),
    )

    # Teams
    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
    )

    # Team members
    op.create_table(
        "team_members",
        sa.Column(
            "team_id",
            sa.String(36),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("role", sa.String(50), default="member"),
        sa.Column("joined_at", sa.DateTime, default=sa.func.now()),
    )

    # Projects
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("standard", sa.String(50), default="IEC62443"),
        sa.Column("version", sa.String(20), default="1.0"),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, default=sa.func.now()),
        sa.Column("is_archived", sa.Boolean, default=False, index=True),
        sa.Column("archived_at", sa.DateTime),
    )

    # Project access
    op.create_table(
        "project_access",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "team_id",
            sa.String(36),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
        ),
        sa.Column("permission", sa.String(50), nullable=False),
        sa.Column("granted_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("granted_at", sa.DateTime, default=sa.func.now()),
        sa.CheckConstraint(
            "(user_id IS NOT NULL) OR (team_id IS NOT NULL)",
            name="check_user_or_team",
        ),
    )

    # Zones
    op.create_table(
        "zones",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("zone_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("security_level_target", sa.Integer, nullable=False),
        sa.Column("security_level_capability", sa.Integer),
        sa.Column("description", sa.Text),
        sa.Column("parent_zone_id", sa.String(100)),
        sa.Column("network_segment", sa.String(100)),
    )

    # Assets
    op.create_table(
        "assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "zone_db_id",
            sa.String(36),
            sa.ForeignKey("zones.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("mac_address", sa.String(17)),
        sa.Column("vendor", sa.String(255)),
        sa.Column("model", sa.String(255)),
        sa.Column("firmware_version", sa.String(100)),
        sa.Column("description", sa.Text),
        sa.Column("criticality", sa.Integer, default=3),
    )

    # Conduits
    op.create_table(
        "conduits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("conduit_id", sa.String(100), nullable=False),
        sa.Column("name", sa.String(255)),
        sa.Column(
            "from_zone_db_id",
            sa.String(36),
            sa.ForeignKey("zones.id"),
            nullable=False,
        ),
        sa.Column(
            "to_zone_db_id",
            sa.String(36),
            sa.ForeignKey("zones.id"),
            nullable=False,
        ),
        sa.Column("security_level_required", sa.Integer),
        sa.Column("requires_inspection", sa.Boolean, default=False),
        sa.Column("description", sa.Text),
    )

    # Protocol flows
    op.create_table(
        "protocol_flows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conduit_id",
            sa.String(36),
            sa.ForeignKey("conduits.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("protocol", sa.String(100), nullable=False),
        sa.Column("port", sa.Integer),
        sa.Column("direction", sa.String(20), default="bidirectional"),
        sa.Column("description", sa.Text),
    )

    # Comments
    op.create_table(
        "comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("is_resolved", sa.Boolean, default=False),
        sa.Column("resolved_by", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("resolved_at", sa.DateTime),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, default=sa.func.now()),
    )

    # Nmap scans
    op.create_table(
        "nmap_scans",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("uploaded_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("scan_date", sa.DateTime),
        sa.Column("host_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
    )

    # Nmap hosts
    op.create_table(
        "nmap_hosts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "scan_id",
            sa.String(36),
            sa.ForeignKey("nmap_scans.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("mac_address", sa.String(17)),
        sa.Column("hostname", sa.String(255)),
        sa.Column("os_detection", sa.Text),
        sa.Column("status", sa.String(20), default="up"),
        sa.Column("imported_as_asset_id", sa.String(36), sa.ForeignKey("assets.id")),
        sa.Column("ports_json", sa.Text),
    )

    # Templates
    op.create_table(
        "templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("category", sa.String(100)),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("is_public", sa.Boolean, default=False),
        sa.Column("project_json", sa.Text, nullable=False),
        sa.Column("zone_count", sa.Integer, default=0),
        sa.Column("asset_count", sa.Integer, default=0),
        sa.Column("conduit_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, default=sa.func.now()),
    )

    # Activity logs
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("entity_type", sa.String(50)),
        sa.Column("entity_id", sa.String(100)),
        sa.Column("entity_name", sa.String(255)),
        sa.Column("details", sa.Text),
        sa.Column("created_at", sa.DateTime, default=sa.func.now(), index=True),
    )

    # Notifications
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.Text),
        sa.Column("link", sa.String(500)),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
        ),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id")),
        sa.Column("is_read", sa.Boolean, default=False, index=True),
        sa.Column("created_at", sa.DateTime, default=sa.func.now(), index=True),
    )

    # Project versions
    op.create_table(
        "project_versions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("version_number", sa.Integer, nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, default=sa.func.now()),
        sa.Column("description", sa.Text),
        sa.Column("snapshot", sa.Text, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("project_versions")
    op.drop_table("notifications")
    op.drop_table("activity_logs")
    op.drop_table("templates")
    op.drop_table("nmap_hosts")
    op.drop_table("nmap_scans")
    op.drop_table("comments")
    op.drop_table("protocol_flows")
    op.drop_table("conduits")
    op.drop_table("assets")
    op.drop_table("zones")
    op.drop_table("project_access")
    op.drop_table("projects")
    op.drop_table("team_members")
    op.drop_table("teams")
    op.drop_table("users")
