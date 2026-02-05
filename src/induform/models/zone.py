"""Zone model for IEC 62443 security zones."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator

from induform.models.asset import Asset


class ZoneType(str, Enum):
    """Types of security zones per IEC 62443."""

    ENTERPRISE = "enterprise"
    SITE = "site"
    AREA = "area"
    CELL = "cell"
    DMZ = "dmz"
    SAFETY = "safety"


class Zone(BaseModel):
    """A security zone as defined in IEC 62443."""

    id: str = Field(..., description="Unique identifier for the zone")
    name: str = Field(..., description="Human-readable name")
    type: ZoneType = Field(..., description="Zone type per IEC 62443 hierarchy")
    security_level_target: int = Field(
        ...,
        ge=1,
        le=4,
        alias="security_level_target",
        description="Target Security Level (SL-T) from 1-4",
    )
    security_level_capability: int | None = Field(
        None,
        ge=1,
        le=4,
        description="Capability Security Level (SL-C) from 1-4",
    )
    description: str | None = Field(None, description="Zone description")
    assets: list[Asset] = Field(default_factory=list, description="Assets in this zone")
    parent_zone: str | None = Field(
        None,
        description="Parent zone ID for hierarchical organization",
    )
    network_segment: str | None = Field(None, description="Network segment/VLAN identifier")
    x_position: float | None = Field(None, description="X position in the visual editor")
    y_position: float | None = Field(None, description="Y position in the visual editor")

    model_config = {"extra": "forbid", "populate_by_name": True}

    @field_validator("security_level_capability")
    @classmethod
    def capability_meets_target(cls, v: int | None, info) -> int | None:
        """Validate that SL-C meets or exceeds SL-T if both are set."""
        if v is not None:
            target = info.data.get("security_level_target")
            if target is not None and v < target:
                raise ValueError(
                    f"Security Level Capability ({v}) must meet or exceed "
                    f"Security Level Target ({target})"
                )
        return v
