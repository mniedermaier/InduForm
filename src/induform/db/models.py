"""SQLAlchemy models for InduForm database."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class User(Base):
    """User account model."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    force_logout_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    owned_projects: Mapped[list["ProjectDB"]] = relationship(
        "ProjectDB", back_populates="owner", foreign_keys="ProjectDB.owner_id"
    )
    team_memberships: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="user", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="author", foreign_keys="Comment.author_id"
    )


class Team(Base):
    """Team model for organizing users."""

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])
    members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="team", cascade="all, delete-orphan"
    )
    project_access: Mapped[list["ProjectAccess"]] = relationship(
        "ProjectAccess", back_populates="team", cascade="all, delete-orphan"
    )


class TeamMember(Base):
    """Team membership model."""

    __tablename__ = "team_members"

    team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(50), default="member")  # owner, admin, member
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    team: Mapped["Team"] = relationship("Team", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="team_memberships")


class ProjectDB(Base):
    """Project model stored in database."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    standard: Mapped[str] = mapped_column(String(50), default="IEC62443")
    compliance_standards: Mapped[str | None] = mapped_column(Text, nullable=True)
    allowed_protocols: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(20), default="1.0")
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Relationships
    owner: Mapped["User"] = relationship(
        "User", back_populates="owned_projects", foreign_keys=[owner_id]
    )
    access_list: Mapped[list["ProjectAccess"]] = relationship(
        "ProjectAccess", back_populates="project", cascade="all, delete-orphan"
    )
    zones: Mapped[list["ZoneDB"]] = relationship(
        "ZoneDB", back_populates="project", cascade="all, delete-orphan"
    )
    conduits: Mapped[list["ConduitDB"]] = relationship(
        "ConduitDB", back_populates="project", cascade="all, delete-orphan"
    )
    comments: Mapped[list["Comment"]] = relationship(
        "Comment", back_populates="project", cascade="all, delete-orphan"
    )
    nmap_scans: Mapped[list["NmapScan"]] = relationship(
        "NmapScan", back_populates="project", cascade="all, delete-orphan"
    )


class ProjectAccess(Base):
    """Project access control model."""

    __tablename__ = "project_access"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    permission: Mapped[str] = mapped_column(String(50), nullable=False)  # editor, viewer
    granted_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Constraint: either user_id or team_id must be set
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL) OR (team_id IS NOT NULL)",
            name="check_user_or_team",
        ),
    )

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB", back_populates="access_list")
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
    team: Mapped[Optional["Team"]] = relationship("Team", back_populates="project_access")
    granter: Mapped["User"] = relationship("User", foreign_keys=[granted_by])


class ZoneDB(Base):
    """Zone model stored in database."""

    __tablename__ = "zones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    zone_id: Mapped[str] = mapped_column(String(100), nullable=False)  # User-defined ID
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    security_level_target: Mapped[int] = mapped_column(Integer, nullable=False)
    security_level_capability: Mapped[int | None] = mapped_column(Integer)
    description: Mapped[str | None] = mapped_column(Text)
    parent_zone_id: Mapped[str | None] = mapped_column(String(100))
    network_segment: Mapped[str | None] = mapped_column(String(100))
    x_position: Mapped[float | None] = mapped_column(nullable=True)
    y_position: Mapped[float | None] = mapped_column(nullable=True)

    __table_args__ = (
        # Unique constraint on (project_id, zone_id)
        {"sqlite_autoincrement": True},
    )

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB", back_populates="zones")
    assets: Mapped[list["AssetDB"]] = relationship(
        "AssetDB", back_populates="zone", cascade="all, delete-orphan"
    )
    conduits_from: Mapped[list["ConduitDB"]] = relationship(
        "ConduitDB", back_populates="from_zone_obj", foreign_keys="ConduitDB.from_zone_db_id"
    )
    conduits_to: Mapped[list["ConduitDB"]] = relationship(
        "ConduitDB", back_populates="to_zone_obj", foreign_keys="ConduitDB.to_zone_db_id"
    )


class AssetDB(Base):
    """Asset model stored in database."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    zone_db_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("zones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    asset_id: Mapped[str] = mapped_column(String(100), nullable=False)  # User-defined ID
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    mac_address: Mapped[str | None] = mapped_column(String(17))
    vendor: Mapped[str | None] = mapped_column(String(255))
    model: Mapped[str | None] = mapped_column(String(255))
    firmware_version: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    criticality: Mapped[int] = mapped_column(Integer, default=3)

    # OS & Software
    os_name: Mapped[str | None] = mapped_column(String(255))
    os_version: Mapped[str | None] = mapped_column(String(100))
    software: Mapped[str | None] = mapped_column(Text)
    cpe: Mapped[str | None] = mapped_column(String(255))

    # Network
    subnet: Mapped[str | None] = mapped_column(String(45))
    gateway: Mapped[str | None] = mapped_column(String(45))
    vlan: Mapped[int | None] = mapped_column(Integer)
    dns: Mapped[str | None] = mapped_column(String(255))
    open_ports: Mapped[str | None] = mapped_column(Text)
    protocols: Mapped[str | None] = mapped_column(Text)

    # Lifecycle
    purchase_date: Mapped[str | None] = mapped_column(String(10))
    end_of_life: Mapped[str | None] = mapped_column(String(10))
    warranty_expiry: Mapped[str | None] = mapped_column(String(10))
    last_patched: Mapped[str | None] = mapped_column(String(10))
    patch_level: Mapped[str | None] = mapped_column(String(100))
    location: Mapped[str | None] = mapped_column(String(255))

    # Relationships
    zone: Mapped["ZoneDB"] = relationship("ZoneDB", back_populates="assets")
    vulnerabilities: Mapped[list["Vulnerability"]] = relationship(
        "Vulnerability", back_populates="asset", cascade="all, delete-orphan"
    )


class ConduitDB(Base):
    """Conduit model stored in database."""

    __tablename__ = "conduits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    conduit_id: Mapped[str] = mapped_column(String(100), nullable=False)  # User-defined ID
    name: Mapped[str | None] = mapped_column(String(255))
    from_zone_db_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("zones.id"), nullable=False, index=True
    )
    to_zone_db_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("zones.id"), nullable=False, index=True
    )
    security_level_required: Mapped[int | None] = mapped_column(Integer)
    requires_inspection: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text)

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB", back_populates="conduits")
    from_zone_obj: Mapped["ZoneDB"] = relationship(
        "ZoneDB", back_populates="conduits_from", foreign_keys=[from_zone_db_id]
    )
    to_zone_obj: Mapped["ZoneDB"] = relationship(
        "ZoneDB", back_populates="conduits_to", foreign_keys=[to_zone_db_id]
    )
    flows: Mapped[list["ProtocolFlowDB"]] = relationship(
        "ProtocolFlowDB", back_populates="conduit", cascade="all, delete-orphan"
    )


class ProtocolFlowDB(Base):
    """Protocol flow model stored in database."""

    __tablename__ = "protocol_flows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    conduit_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("conduits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    protocol: Mapped[str] = mapped_column(String(100), nullable=False)
    port: Mapped[int | None] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(String(20), default="bidirectional")
    description: Mapped[str | None] = mapped_column(Text)

    # Relationships
    conduit: Mapped["ConduitDB"] = relationship("ConduitDB", back_populates="flows")


class Comment(Base):
    """Comment/annotation model."""

    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # zone, conduit, asset
    entity_id: Mapped[str] = mapped_column(String(100), nullable=False)
    author_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB", back_populates="comments")
    author: Mapped["User"] = relationship(
        "User", back_populates="comments", foreign_keys=[author_id]
    )
    resolver: Mapped[Optional["User"]] = relationship("User", foreign_keys=[resolved_by])


class NmapScan(Base):
    """Nmap scan upload model."""

    __tablename__ = "nmap_scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    scan_date: Mapped[datetime | None] = mapped_column(DateTime)
    host_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB", back_populates="nmap_scans")
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploaded_by])
    hosts: Mapped[list["NmapHost"]] = relationship(
        "NmapHost", back_populates="scan", cascade="all, delete-orphan"
    )


class NmapHost(Base):
    """Nmap discovered host model."""

    __tablename__ = "nmap_hosts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    scan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("nmap_scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    mac_address: Mapped[str | None] = mapped_column(String(17))
    hostname: Mapped[str | None] = mapped_column(String(255))
    os_detection: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="up")
    imported_as_asset_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("assets.id"))
    ports_json: Mapped[str | None] = mapped_column(Text)  # JSON array of open ports

    # Relationships
    scan: Mapped["NmapScan"] = relationship("NmapScan", back_populates="hosts")
    imported_asset: Mapped[Optional["AssetDB"]] = relationship("AssetDB")


class TemplateDB(Base):
    """User-created project template model."""

    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100))  # e.g., "manufacturing", "utility"
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    project_json: Mapped[str] = mapped_column(Text, nullable=False)  # Serialized Project as JSON
    zone_count: Mapped[int] = mapped_column(Integer, default=0)
    asset_count: Mapped[int] = mapped_column(Integer, default=0)
    conduit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", foreign_keys=[owner_id])


class ActivityLog(Base):
    """Activity log for tracking project changes."""

    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    action: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # created, updated, deleted, shared, etc.
    entity_type: Mapped[str | None] = mapped_column(String(50))  # zone, asset, conduit, project
    entity_id: Mapped[str | None] = mapped_column(String(100))
    entity_name: Mapped[str | None] = mapped_column(String(255))
    details: Mapped[str | None] = mapped_column(Text)  # JSON with change details
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB")
    user: Mapped["User"] = relationship("User")


class Notification(Base):
    """User notification model."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # project_update, comment, mention, share
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(500))  # URL to navigate to
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE")
    )
    actor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id")
    )  # User who triggered
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    actor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[actor_id])
    project: Mapped[Optional["ProjectDB"]] = relationship("ProjectDB")


class RevokedToken(Base):
    """Revoked JWT token for logout/session invalidation."""

    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    revoked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class PasswordResetToken(Base):
    """Password reset token model."""

    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class MetricsSnapshot(Base):
    """Time-series metrics snapshot for projects."""

    __tablename__ = "metrics_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    zone_count: Mapped[int] = mapped_column(Integer, default=0)
    asset_count: Mapped[int] = mapped_column(Integer, default=0)
    conduit_count: Mapped[int] = mapped_column(Integer, default=0)
    compliance_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)  # 0-100
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB")


class ProjectVersion(Base):
    """Project version/snapshot model for version history."""

    __tablename__ = "project_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    project_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    description: Mapped[str | None] = mapped_column(Text)  # Optional change description
    snapshot: Mapped[str] = mapped_column(Text, nullable=False)  # Full project state as JSON

    __table_args__ = (
        # Unique constraint on (project_id, version_number)
        {"sqlite_autoincrement": True},
    )

    # Relationships
    project: Mapped["ProjectDB"] = relationship("ProjectDB")
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])


class Vulnerability(Base):
    """Asset vulnerability tracking model."""

    __tablename__ = "vulnerabilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    asset_db_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("assets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cve_id: Mapped[str] = mapped_column(String(20), nullable=False)  # e.g. CVE-2024-12345
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)  # critical, high, medium, low
    cvss_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0.0 - 10.0
    status: Mapped[str] = mapped_column(
        String(20), default="open"
    )  # open, mitigated, accepted, false_positive
    mitigation_notes: Mapped[str | None] = mapped_column(Text)
    discovered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    added_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)

    # Relationships
    asset: Mapped["AssetDB"] = relationship("AssetDB", back_populates="vulnerabilities")
    reporter: Mapped["User"] = relationship("User", foreign_keys=[added_by])


class LoginAttempt(Base):
    """Login attempt tracking model."""

    __tablename__ = "login_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    username_attempted: Mapped[str] = mapped_column(String(255), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", foreign_keys=[user_id])
