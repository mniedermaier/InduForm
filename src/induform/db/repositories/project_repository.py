"""Project repository for database operations."""

import json

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from induform.db.models import (
    AssetDB,
    ConduitDB,
    ProjectAccess,
    ProjectDB,
    ProtocolFlowDB,
    TeamMember,
    ZoneDB,
)
from induform.models.asset import Asset
from induform.models.conduit import Conduit, ProtocolFlow
from induform.models.project import Project, ProjectMetadata
from induform.models.zone import Zone


class ProjectRepository:
    """Repository for Project operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        name: str,
        owner_id: str,
        description: str | None = None,
        standard: str = "IEC62443",
        version: str = "1.0",
        compliance_standards: list[str] | None = None,
        allowed_protocols: list[str] | None = None,
    ) -> ProjectDB:
        """Create a new project."""
        if compliance_standards is None:
            compliance_standards = [standard]
        project = ProjectDB(
            name=name,
            description=description,
            standard=standard,
            compliance_standards=json.dumps(compliance_standards),
            allowed_protocols=json.dumps(allowed_protocols or []),
            version=version,
            owner_id=owner_id,
        )
        self.session.add(project)
        await self.session.flush()
        return project

    async def get_by_id(
        self,
        project_id: str,
        load_relations: bool = True,
    ) -> ProjectDB | None:
        """Get a project by ID."""
        query = select(ProjectDB).where(ProjectDB.id == project_id)

        if load_relations:
            query = query.options(
                selectinload(ProjectDB.zones).selectinload(ZoneDB.assets),
                selectinload(ProjectDB.conduits).selectinload(ConduitDB.flows),
                selectinload(ProjectDB.conduits).selectinload(ConduitDB.from_zone_obj),
                selectinload(ProjectDB.conduits).selectinload(ConduitDB.to_zone_obj),
                selectinload(ProjectDB.owner),
            )

        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_with_permission_check(
        self,
        project_id: str,
        user_id: str,
        required_permission: str = "viewer",
        is_admin: bool = False,
    ) -> ProjectDB | None:
        """Get a project if the user has the required permission."""
        project = await self.get_by_id(project_id)
        if not project:
            return None

        # Admin has full access
        if is_admin:
            return project

        # Owner has full access
        if project.owner_id == user_id:
            return project

        # Check direct user access
        result = await self.session.execute(
            select(ProjectAccess).where(
                ProjectAccess.project_id == project_id,
                ProjectAccess.user_id == user_id,
            )
        )
        access = result.scalar_one_or_none()
        if access:
            if required_permission == "viewer":
                return project
            if required_permission == "editor" and access.permission == "editor":
                return project

        # Check team access
        result = await self.session.execute(
            select(ProjectAccess)
            .join(TeamMember, ProjectAccess.team_id == TeamMember.team_id)
            .where(
                ProjectAccess.project_id == project_id,
                TeamMember.user_id == user_id,
            )
        )
        team_access = result.scalar_one_or_none()
        if team_access:
            if required_permission == "viewer":
                return project
            if required_permission == "editor" and team_access.permission == "editor":
                return project

        return None

    async def list_accessible(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 100,
        load_full: bool = False,
        is_admin: bool = False,
    ) -> list[ProjectDB]:
        """List all projects accessible to a user.

        Args:
            user_id: The user ID to check access for
            skip: Number of records to skip
            limit: Maximum number of records to return
            load_full: If True, load all relations (zones, conduits) for risk calculation
            is_admin: If True, return all projects (admin has full access)
        """
        if is_admin:
            # Admins see all projects
            query = select(ProjectDB).options(selectinload(ProjectDB.owner))
        else:
            # Get user's team IDs
            team_result = await self.session.execute(
                select(TeamMember.team_id).where(TeamMember.user_id == user_id)
            )
            team_ids = [row[0] for row in team_result.fetchall()]

            # Query projects where user is owner, has direct access, or team access
            query = (
                select(ProjectDB)
                .distinct()
                .outerjoin(ProjectAccess)
                .where(
                    or_(
                        ProjectDB.owner_id == user_id,
                        ProjectAccess.user_id == user_id,
                        ProjectAccess.team_id.in_(team_ids) if team_ids else False,
                    )
                )
                .options(selectinload(ProjectDB.owner))
            )

        if load_full:
            query = query.options(
                selectinload(ProjectDB.zones).selectinload(ZoneDB.assets),
                selectinload(ProjectDB.conduits).selectinload(ConduitDB.flows),
            )
        else:
            # Just load zones for counting, not full data
            query = query.options(selectinload(ProjectDB.zones))
            query = query.options(selectinload(ProjectDB.conduits))

        query = query.offset(skip).limit(limit).order_by(ProjectDB.updated_at.desc())

        result = await self.session.execute(query)
        return list(result.scalars().unique().all())

    async def update(self, project: ProjectDB, **kwargs) -> ProjectDB:
        """Update a project's attributes."""
        for key, value in kwargs.items():
            if hasattr(project, key) and key not in ("id", "owner_id", "created_at"):
                setattr(project, key, value)
        await self.session.flush()
        return project

    async def delete(self, project: ProjectDB) -> None:
        """Delete a project and all related data."""
        await self.session.delete(project)
        await self.session.flush()

    # Access control methods

    async def grant_access(
        self,
        project_id: str,
        granted_by: str,
        user_id: str | None = None,
        team_id: str | None = None,
        permission: str = "viewer",
    ) -> ProjectAccess:
        """Grant access to a project."""
        access = ProjectAccess(
            project_id=project_id,
            user_id=user_id,
            team_id=team_id,
            permission=permission,
            granted_by=granted_by,
        )
        self.session.add(access)
        await self.session.flush()
        return access

    async def revoke_access(self, access_id: str) -> bool:
        """Revoke access to a project."""
        result = await self.session.execute(
            select(ProjectAccess).where(ProjectAccess.id == access_id)
        )
        access = result.scalar_one_or_none()
        if access:
            await self.session.delete(access)
            await self.session.flush()
            return True
        return False

    async def list_access(self, project_id: str) -> list[ProjectAccess]:
        """List all access grants for a project."""
        result = await self.session.execute(
            select(ProjectAccess)
            .options(
                selectinload(ProjectAccess.user),
                selectinload(ProjectAccess.team),
            )
            .where(ProjectAccess.project_id == project_id)
        )
        return list(result.scalars().all())

    # Conversion methods between DB models and Pydantic models

    async def to_pydantic(self, project_db: ProjectDB) -> Project:
        """Convert a database project to a Pydantic Project model."""
        # Load relations if not loaded
        if not project_db.zones:
            project_db = await self.get_by_id(project_db.id, load_relations=True)

        zones = []
        zone_id_map = {}  # Map DB zone IDs to user zone IDs

        for zone_db in project_db.zones:
            zone_id_map[zone_db.id] = zone_db.zone_id
            assets = [
                Asset(
                    id=asset_db.asset_id,
                    name=asset_db.name,
                    type=asset_db.type,
                    ip_address=asset_db.ip_address,
                    mac_address=asset_db.mac_address,
                    vendor=asset_db.vendor,
                    model=asset_db.model,
                    firmware_version=asset_db.firmware_version,
                    description=asset_db.description,
                    criticality=asset_db.criticality,
                    os_name=asset_db.os_name,
                    os_version=asset_db.os_version,
                    software=asset_db.software,
                    cpe=asset_db.cpe,
                    subnet=asset_db.subnet,
                    gateway=asset_db.gateway,
                    vlan=asset_db.vlan,
                    dns=asset_db.dns,
                    open_ports=asset_db.open_ports,
                    protocols=asset_db.protocols,
                    purchase_date=asset_db.purchase_date,
                    end_of_life=asset_db.end_of_life,
                    warranty_expiry=asset_db.warranty_expiry,
                    last_patched=asset_db.last_patched,
                    patch_level=asset_db.patch_level,
                    location=asset_db.location,
                )
                for asset_db in zone_db.assets
            ]

            zones.append(
                Zone(
                    id=zone_db.zone_id,
                    name=zone_db.name,
                    type=zone_db.type,
                    security_level_target=zone_db.security_level_target,
                    security_level_capability=zone_db.security_level_capability,
                    description=zone_db.description,
                    assets=assets,
                    parent_zone=zone_db.parent_zone_id,
                    network_segment=zone_db.network_segment,
                    x_position=zone_db.x_position,
                    y_position=zone_db.y_position,
                )
            )

        conduits = []
        for conduit_db in project_db.conduits:
            flows = [
                ProtocolFlow(
                    protocol=flow_db.protocol,
                    port=flow_db.port,
                    direction=flow_db.direction,
                    description=flow_db.description,
                )
                for flow_db in conduit_db.flows
            ]

            conduits.append(
                Conduit(
                    id=conduit_db.conduit_id,
                    name=conduit_db.name,
                    from_zone=conduit_db.from_zone_obj.zone_id,
                    to_zone=conduit_db.to_zone_obj.zone_id,
                    flows=flows,
                    security_level_required=conduit_db.security_level_required,
                    requires_inspection=conduit_db.requires_inspection,
                    description=conduit_db.description,
                )
            )

        # Deserialize compliance_standards from JSON
        compliance_standards = ["IEC62443"]
        if project_db.compliance_standards:
            try:
                compliance_standards = json.loads(project_db.compliance_standards)
            except (json.JSONDecodeError, TypeError):
                compliance_standards = [project_db.standard or "IEC62443"]

        # Deserialize allowed_protocols from JSON
        allowed_protocols: list[str] = []
        if project_db.allowed_protocols:
            try:
                allowed_protocols = json.loads(project_db.allowed_protocols)
            except (json.JSONDecodeError, TypeError):
                allowed_protocols = []

        return Project(
            version=project_db.version,
            project=ProjectMetadata(
                name=project_db.name,
                description=project_db.description,
                compliance_standards=compliance_standards,
                allowed_protocols=allowed_protocols,
            ),
            zones=zones,
            conduits=conduits,
        )

    async def from_pydantic(
        self,
        project: Project,
        project_db: ProjectDB,
    ) -> ProjectDB:
        """Update a database project from a Pydantic Project model.

        This method syncs the project data, creating/updating/deleting
        zones, assets, conduits, and flows as needed.
        """
        # Update project metadata
        project_db.name = project.project.name
        project_db.description = project.project.description
        # Keep standard as first compliance standard for backwards compat
        standards = project.project.compliance_standards
        project_db.standard = standards[0] if standards else "IEC62443"
        project_db.compliance_standards = json.dumps(standards)
        project_db.allowed_protocols = json.dumps(project.project.allowed_protocols)
        project_db.version = project.version

        # Build map of existing zones by user ID
        existing_zones = {z.zone_id: z for z in project_db.zones}
        new_zone_ids = {z.id for z in project.zones}

        # Delete zones that are no longer in the project
        for zone_id, zone_db in list(existing_zones.items()):
            if zone_id not in new_zone_ids:
                await self.session.delete(zone_db)
                del existing_zones[zone_id]

        # Create/update zones
        zone_db_map = {}  # Map user zone IDs to DB zone objects
        for zone in project.zones:
            if zone.id in existing_zones:
                zone_db = existing_zones[zone.id]
                zone_db.name = zone.name
                zone_db.type = zone.type
                zone_db.security_level_target = zone.security_level_target
                zone_db.security_level_capability = zone.security_level_capability
                zone_db.description = zone.description
                zone_db.parent_zone_id = zone.parent_zone
                zone_db.network_segment = zone.network_segment
                zone_db.x_position = zone.x_position
                zone_db.y_position = zone.y_position
            else:
                zone_db = ZoneDB(
                    project_id=project_db.id,
                    zone_id=zone.id,
                    name=zone.name,
                    type=zone.type,
                    security_level_target=zone.security_level_target,
                    security_level_capability=zone.security_level_capability,
                    description=zone.description,
                    parent_zone_id=zone.parent_zone,
                    network_segment=zone.network_segment,
                    x_position=zone.x_position,
                    y_position=zone.y_position,
                )
                self.session.add(zone_db)
                await self.session.flush()

            zone_db_map[zone.id] = zone_db

            # Sync assets - only check existing if zone was already in DB
            is_new_zone = zone.id not in existing_zones
            existing_assets: dict[str, AssetDB] = {}

            if not is_new_zone:
                # Zone existed, get its assets
                existing_assets = {a.asset_id: a for a in zone_db.assets}
                new_asset_ids = {a.id for a in zone.assets}

                # Delete removed assets
                for asset_id, asset_db in list(existing_assets.items()):
                    if asset_id not in new_asset_ids:
                        await self.session.delete(asset_db)

            # Create/update assets
            for asset in zone.assets:
                if asset.id in existing_assets:
                    asset_db = existing_assets[asset.id]
                    asset_db.name = asset.name
                    asset_db.type = asset.type
                    asset_db.ip_address = asset.ip_address
                    asset_db.mac_address = asset.mac_address
                    asset_db.vendor = asset.vendor
                    asset_db.model = asset.model
                    asset_db.firmware_version = asset.firmware_version
                    asset_db.description = asset.description
                    asset_db.criticality = asset.criticality or 3
                    asset_db.os_name = asset.os_name
                    asset_db.os_version = asset.os_version
                    asset_db.software = asset.software
                    asset_db.cpe = asset.cpe
                    asset_db.subnet = asset.subnet
                    asset_db.gateway = asset.gateway
                    asset_db.vlan = asset.vlan
                    asset_db.dns = asset.dns
                    asset_db.open_ports = asset.open_ports
                    asset_db.protocols = asset.protocols
                    asset_db.purchase_date = asset.purchase_date
                    asset_db.end_of_life = asset.end_of_life
                    asset_db.warranty_expiry = asset.warranty_expiry
                    asset_db.last_patched = asset.last_patched
                    asset_db.patch_level = asset.patch_level
                    asset_db.location = asset.location
                else:
                    asset_db = AssetDB(
                        zone_db_id=zone_db.id,
                        asset_id=asset.id,
                        name=asset.name,
                        type=asset.type,
                        ip_address=asset.ip_address,
                        mac_address=asset.mac_address,
                        vendor=asset.vendor,
                        model=asset.model,
                        firmware_version=asset.firmware_version,
                        description=asset.description,
                        criticality=asset.criticality or 3,
                        os_name=asset.os_name,
                        os_version=asset.os_version,
                        software=asset.software,
                        cpe=asset.cpe,
                        subnet=asset.subnet,
                        gateway=asset.gateway,
                        vlan=asset.vlan,
                        dns=asset.dns,
                        open_ports=asset.open_ports,
                        protocols=asset.protocols,
                        purchase_date=asset.purchase_date,
                        end_of_life=asset.end_of_life,
                        warranty_expiry=asset.warranty_expiry,
                        last_patched=asset.last_patched,
                        patch_level=asset.patch_level,
                        location=asset.location,
                    )
                    self.session.add(asset_db)

        await self.session.flush()

        # Build map of existing conduits by user ID
        existing_conduits = {c.conduit_id: c for c in project_db.conduits}
        new_conduit_ids = {c.id for c in project.conduits}

        # Delete conduits that are no longer in the project
        for conduit_id, conduit_db in list(existing_conduits.items()):
            if conduit_id not in new_conduit_ids:
                await self.session.delete(conduit_db)
                del existing_conduits[conduit_id]

        # Create/update conduits
        for conduit in project.conduits:
            from_zone_db = zone_db_map.get(conduit.from_zone)
            to_zone_db = zone_db_map.get(conduit.to_zone)

            if not from_zone_db or not to_zone_db:
                continue  # Skip invalid conduits

            is_new_conduit = conduit.id not in existing_conduits

            if not is_new_conduit:
                conduit_db = existing_conduits[conduit.id]
                conduit_db.name = conduit.name
                conduit_db.from_zone_db_id = from_zone_db.id
                conduit_db.to_zone_db_id = to_zone_db.id
                conduit_db.security_level_required = conduit.security_level_required
                conduit_db.requires_inspection = conduit.requires_inspection
                conduit_db.description = conduit.description

                # Delete existing flows and recreate
                for flow_db in conduit_db.flows:
                    await self.session.delete(flow_db)
            else:
                conduit_db = ConduitDB(
                    project_id=project_db.id,
                    conduit_id=conduit.id,
                    name=conduit.name,
                    from_zone_db_id=from_zone_db.id,
                    to_zone_db_id=to_zone_db.id,
                    security_level_required=conduit.security_level_required,
                    requires_inspection=conduit.requires_inspection,
                    description=conduit.description,
                )
                self.session.add(conduit_db)
                await self.session.flush()

            # Create flows
            for flow in conduit.flows:
                flow_db = ProtocolFlowDB(
                    conduit_id=conduit_db.id,
                    protocol=flow.protocol,
                    port=flow.port,
                    direction=flow.direction,
                    description=flow.description,
                )
                self.session.add(flow_db)

        await self.session.flush()
        return project_db

    async def create_from_pydantic(
        self,
        project: Project,
        owner_id: str,
    ) -> ProjectDB:
        """Create a new database project from a Pydantic Project model."""
        standards = project.project.compliance_standards
        project_db = await self.create(
            name=project.project.name,
            owner_id=owner_id,
            description=project.project.description,
            standard=standards[0] if standards else "IEC62443",
            version=project.version,
            compliance_standards=standards,
        )

        # Re-fetch with relations loaded before syncing to avoid MissingGreenlet
        project_db = await self.get_by_id(project_db.id, load_relations=True)

        # Use from_pydantic to sync the data
        project_db = await self.from_pydantic(project, project_db)
        await self.session.flush()

        # Re-fetch with all relations loaded (including zone refs on conduits)
        return await self.get_by_id(project_db.id, load_relations=True)

    async def duplicate(
        self,
        source_project_id: str,
        new_owner_id: str,
        new_name: str | None = None,
    ) -> ProjectDB | None:
        """Duplicate a project with all its zones, assets, and conduits.

        Args:
            source_project_id: ID of the project to duplicate
            new_owner_id: ID of the user who will own the duplicate
            new_name: Optional new name for the duplicate (defaults to "Name (Copy)")

        Returns:
            The new duplicated project, or None if source not found
        """
        # Load the source project with all relations
        source = await self.get_by_id(source_project_id, load_relations=True)
        if not source:
            return None

        # Convert to Pydantic model
        project_pydantic = await self.to_pydantic(source)

        # Set new name
        if new_name:
            project_pydantic.project.name = new_name
        else:
            project_pydantic.project.name = f"{source.name} (Copy)"

        # Create the duplicate
        return await self.create_from_pydantic(project_pydantic, new_owner_id)
