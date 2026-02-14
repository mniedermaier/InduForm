"""Asset model for OT devices."""

from enum import StrEnum

from pydantic import BaseModel, Field


class AssetType(StrEnum):
    """Types of OT assets."""

    PLC = "plc"
    HMI = "hmi"
    SCADA = "scada"
    ENGINEERING_WORKSTATION = "engineering_workstation"
    HISTORIAN = "historian"
    JUMP_HOST = "jump_host"
    FIREWALL = "firewall"
    SWITCH = "switch"
    ROUTER = "router"
    SERVER = "server"
    RTU = "rtu"
    IED = "ied"
    DCS = "dcs"
    OTHER = "other"


class Asset(BaseModel):
    """An OT asset within a zone."""

    id: str = Field(..., description="Unique identifier for the asset")
    name: str = Field(..., description="Human-readable name")
    type: AssetType = Field(..., description="Type of OT asset")
    ip_address: str | None = Field(None, description="IP address if applicable")
    mac_address: str | None = Field(None, description="MAC address if known")
    vendor: str | None = Field(None, description="Equipment vendor")
    model: str | None = Field(None, description="Equipment model")
    firmware_version: str | None = Field(None, description="Firmware version")
    description: str | None = Field(None, description="Additional description")
    criticality: int = Field(
        default=3,
        ge=1,
        le=5,
        description="Criticality level (1=low, 5=critical)",
    )

    model_config = {"extra": "forbid"}
