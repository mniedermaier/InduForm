"""Conduit model for inter-zone communication paths."""

from enum import Enum

from pydantic import BaseModel, Field, model_validator


class ConduitDirection(str, Enum):
    """Direction of traffic flow in a conduit."""

    INBOUND = "inbound"
    OUTBOUND = "outbound"
    BIDIRECTIONAL = "bidirectional"


class ProtocolFlow(BaseModel):
    """A protocol flow within a conduit."""

    protocol: str = Field(
        ...,
        description="Protocol name (e.g., modbus_tcp, opcua, https, ssh)",
    )
    port: int | None = Field(
        None,
        ge=1,
        le=65535,
        description="Port number if applicable",
    )
    direction: ConduitDirection = Field(
        default=ConduitDirection.BIDIRECTIONAL,
        description="Direction of the flow relative to from_zone",
    )
    description: str | None = Field(None, description="Description of this flow's purpose")

    model_config = {"extra": "forbid"}


class Conduit(BaseModel):
    """A conduit connecting two zones, defining allowed communication."""

    id: str = Field(..., description="Unique identifier for the conduit")
    name: str | None = Field(None, description="Human-readable name")
    from_zone: str = Field(..., description="Source zone ID")
    to_zone: str = Field(..., description="Destination zone ID")
    flows: list[ProtocolFlow] = Field(
        default_factory=list,
        description="Allowed protocol flows",
    )
    security_level_required: int | None = Field(
        None,
        ge=1,
        le=4,
        description="Required security level for this conduit (auto-derived if not set)",
    )
    requires_inspection: bool = Field(
        default=False,
        description="Whether deep packet inspection is required",
    )
    description: str | None = Field(None, description="Conduit description")

    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def zones_must_differ(self) -> "Conduit":
        """Validate that from_zone and to_zone are different."""
        if self.from_zone == self.to_zone:
            raise ValueError("from_zone and to_zone must be different")
        return self
