"""Project model - the root configuration object."""

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field, model_validator

from induform.models.conduit import Conduit
from induform.models.zone import Zone


class ProjectMetadata(BaseModel):
    """Project metadata."""

    name: str = Field(..., description="Project name")
    description: str | None = Field(None, description="Project description")
    compliance_standards: list[str] = Field(
        default=["IEC62443"],
        description="Enabled compliance frameworks",
    )
    allowed_protocols: list[str] = Field(
        default=[],
        description="Additional approved protocols for this project",
    )
    version: str | None = Field(None, description="Project version")
    author: str | None = Field(None, description="Project author")

    model_config = {"extra": "ignore"}

    @model_validator(mode="before")
    @classmethod
    def migrate_standard(cls, data: dict[str, Any]) -> dict[str, Any]:
        """Migrate old 'standard' field to 'compliance_standards'."""
        if isinstance(data, dict) and "standard" in data and "compliance_standards" not in data:
            data["compliance_standards"] = [data.pop("standard")]
        return data


class Project(BaseModel):
    """Root project configuration containing zones and conduits."""

    version: str = Field(default="1.0", description="Configuration schema version")
    project: ProjectMetadata = Field(..., description="Project metadata")
    zones: list[Zone] = Field(default_factory=list, description="Security zones")
    conduits: list[Conduit] = Field(default_factory=list, description="Zone conduits")

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def validate_references(self) -> "Project":
        """Validate that all zone references are valid."""
        zone_ids = {z.id for z in self.zones}

        # Validate parent_zone references
        for zone in self.zones:
            if zone.parent_zone and zone.parent_zone not in zone_ids:
                raise ValueError(
                    f"Zone '{zone.id}' references unknown parent_zone '{zone.parent_zone}'"
                )

        # Validate conduit zone references
        for conduit in self.conduits:
            if conduit.from_zone not in zone_ids:
                raise ValueError(
                    f"Conduit '{conduit.id}' references unknown from_zone '{conduit.from_zone}'"
                )
            if conduit.to_zone not in zone_ids:
                raise ValueError(
                    f"Conduit '{conduit.id}' references unknown to_zone '{conduit.to_zone}'"
                )

        return self

    def get_zone(self, zone_id: str) -> Zone | None:
        """Get a zone by ID."""
        for zone in self.zones:
            if zone.id == zone_id:
                return zone
        return None

    def get_conduit(self, conduit_id: str) -> Conduit | None:
        """Get a conduit by ID."""
        for conduit in self.conduits:
            if conduit.id == conduit_id:
                return conduit
        return None

    def get_conduits_for_zone(self, zone_id: str) -> list[Conduit]:
        """Get all conduits connected to a zone."""
        return [c for c in self.conduits if c.from_zone == zone_id or c.to_zone == zone_id]

    @classmethod
    def from_yaml(cls, path: Path | str) -> "Project":
        """Load a project from a YAML file."""
        path = Path(path)
        with path.open() as f:
            data = yaml.safe_load(f)
        return cls.model_validate(data)

    def to_yaml(self, path: Path | str) -> None:
        """Save the project to a YAML file."""
        path = Path(path)
        data = self.model_dump(mode="json", exclude_none=True, by_alias=True)
        with path.open("w") as f:
            yaml.dump(data, f, default_flow_style=False, sort_keys=False)
