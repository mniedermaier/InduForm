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

    # OS & Software
    os_name: str | None = Field(None, description="Operating system name")
    os_version: str | None = Field(None, description="Operating system version")
    software: str | None = Field(None, description="Installed software (comma-separated)")
    cpe: str | None = Field(None, description="CPE 2.3 identifier")

    # Network
    subnet: str | None = Field(None, description="Subnet (e.g., 10.10.1.0/24)")
    gateway: str | None = Field(None, description="Default gateway IP")
    vlan: int | None = Field(None, description="VLAN ID")
    dns: str | None = Field(None, description="DNS server address")
    open_ports: str | None = Field(None, description="Open ports (comma-separated)")
    protocols: str | None = Field(None, description="Network protocols in use")

    # Lifecycle
    purchase_date: str | None = Field(None, description="Purchase date (YYYY-MM-DD)")
    end_of_life: str | None = Field(None, description="End of life date (YYYY-MM-DD)")
    warranty_expiry: str | None = Field(None, description="Warranty expiry date (YYYY-MM-DD)")
    last_patched: str | None = Field(None, description="Last patched date (YYYY-MM-DD)")
    patch_level: str | None = Field(None, description="Current patch level")
    location: str | None = Field(None, description="Physical location")

    model_config = {"extra": "forbid"}
