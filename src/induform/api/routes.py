"""API routes for InduForm."""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from induform.engine.attack_path import AttackPathAnalysis, analyze_attack_paths
from induform.engine.policy import PolicyViolation, evaluate_policies
from induform.engine.resolver import resolve_security_controls
from induform.engine.risk import RiskAssessment, assess_risk
from induform.engine.validator import ValidationReport, validate_project
from induform.generators.compliance import generate_compliance_report
from induform.generators.firewall import (
    export_rules_cisco_asa,
    export_rules_fortinet,
    export_rules_json,
    export_rules_paloalto,
    generate_firewall_rules,
)
from induform.generators.vlan import generate_vlan_mapping
from induform.models.conduit import Conduit
from induform.models.project import Project, ProjectMetadata
from induform.models.zone import Zone

# Template imports moved to templates/routes.py

router = APIRouter()


# Base directory for project files
def get_projects_dir(request: Request) -> Path:
    """Get the projects directory from config path."""
    config_path: Path = request.app.state.config_path
    return config_path.parent


class ProjectResponse(BaseModel):
    """Response model for project data."""

    project: dict[str, Any]
    validation: ValidationReport
    policy_violations: list[PolicyViolation]
    file_path: str


class FileInfo(BaseModel):
    """Information about a project file."""

    name: str
    path: str
    project_name: str | None = None


class SaveAsRequest(BaseModel):
    """Request model for save-as endpoint."""

    filename: str


class GenerateRequest(BaseModel):
    """Request model for generate endpoint."""

    # Project fields (inherited from Project structure)
    version: str
    project: dict[str, Any]
    zones: list[dict[str, Any]]
    conduits: list[dict[str, Any]]
    # Generator fields
    generator: str  # firewall, vlan, report
    options: dict[str, Any] = {}


class GenerateResponse(BaseModel):
    """Response model for generate endpoint."""

    generator: str
    content: Any


@router.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "InduForm API",
        "version": "0.1.0",
        "docs": "/docs",
    }


# File management endpoints


@router.get("/files")
async def list_files(request: Request) -> list[FileInfo]:
    """List available project files."""
    projects_dir = get_projects_dir(request)
    files = []

    for yaml_file in projects_dir.glob("*.yaml"):
        try:
            project = Project.from_yaml(yaml_file)
            project_name = project.project.name
        except Exception:
            project_name = None

        files.append(
            FileInfo(
                name=yaml_file.name,
                path=str(yaml_file),
                project_name=project_name,
            )
        )

    for yml_file in projects_dir.glob("*.yml"):
        try:
            project = Project.from_yaml(yml_file)
            project_name = project.project.name
        except Exception:
            project_name = None

        files.append(
            FileInfo(
                name=yml_file.name,
                path=str(yml_file),
                project_name=project_name,
            )
        )

    return sorted(files, key=lambda f: f.name)


@router.get("/files/current")
async def get_current_file(request: Request) -> FileInfo:
    """Get info about the currently loaded file."""
    config_path: Path = request.app.state.config_path

    project_name = None
    if config_path.exists():
        try:
            project = Project.from_yaml(config_path)
            project_name = project.project.name
        except Exception:
            pass

    return FileInfo(
        name=config_path.name,
        path=str(config_path),
        project_name=project_name,
    )


@router.post("/files/open")
async def open_file(file_info: FileInfo, request: Request) -> ProjectResponse:
    """Open a different project file."""
    file_path = Path(file_info.path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {file_path}")

    try:
        project = Project.from_yaml(file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {e}")

    # Update the current config path
    request.app.state.config_path = file_path

    enabled_standards = project.project.compliance_standards or None
    validation = validate_project(project, enabled_standards=enabled_standards)
    violations = evaluate_policies(project, enabled_standards=enabled_standards)

    return ProjectResponse(
        project=project.model_dump(mode="json"),
        validation=validation,
        policy_violations=violations,
        file_path=str(file_path),
    )


@router.post("/files/new")
async def new_file(save_as: SaveAsRequest, request: Request) -> ProjectResponse:
    """Create a new project file."""
    projects_dir = get_projects_dir(request)
    filename = save_as.filename

    # Ensure .yaml extension
    if not filename.endswith((".yaml", ".yml")):
        filename += ".yaml"

    file_path = projects_dir / filename

    if file_path.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {filename}")

    # Create empty project
    project = Project(
        version="1.0",
        project=ProjectMetadata(
            name=filename.replace(".yaml", "").replace(".yml", "").replace("_", " ").title(),
            description="New InduForm project",
            compliance_standards=["IEC62443"],
        ),
        zones=[],
        conduits=[],
    )

    try:
        project.to_yaml(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating file: {e}")

    # Update current config path
    request.app.state.config_path = file_path

    enabled_standards = project.project.compliance_standards or None
    validation = validate_project(project, enabled_standards=enabled_standards)
    violations = evaluate_policies(project, enabled_standards=enabled_standards)

    return ProjectResponse(
        project=project.model_dump(mode="json"),
        validation=validation,
        policy_violations=violations,
        file_path=str(file_path),
    )


@router.post("/files/save-as")
async def save_as(project: Project, save_as: SaveAsRequest, request: Request) -> dict[str, str]:
    """Save project to a new file."""
    projects_dir = get_projects_dir(request)
    filename = save_as.filename

    # Ensure .yaml extension
    if not filename.endswith((".yaml", ".yml")):
        filename += ".yaml"

    file_path = projects_dir / filename

    try:
        project.to_yaml(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {e}")

    # Update current config path
    request.app.state.config_path = file_path

    return {"status": "saved", "path": str(file_path), "filename": filename}


# Project endpoints


@router.get("/project")
async def get_project(request: Request) -> ProjectResponse:
    """Get the current project configuration with validation."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail=f"Configuration file not found: {config_path}")

    try:
        project = Project.from_yaml(config_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing configuration: {e}")

    enabled_standards = project.project.compliance_standards or None
    validation = validate_project(project, enabled_standards=enabled_standards)
    violations = evaluate_policies(project, enabled_standards=enabled_standards)

    return ProjectResponse(
        project=project.model_dump(mode="json"),
        validation=validation,
        policy_violations=violations,
        file_path=str(config_path),
    )


@router.post("/project")
async def save_project(project: Project, request: Request) -> dict[str, str]:
    """Save a project configuration."""
    config_path: Path = request.app.state.config_path

    try:
        project.to_yaml(config_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving configuration: {e}")

    return {"status": "saved", "path": str(config_path)}


@router.post("/validate")
async def validate(project: Project) -> ValidationReport:
    """Validate a project configuration."""
    enabled_standards = project.project.compliance_standards or None
    return validate_project(project, enabled_standards=enabled_standards)


@router.post("/policies")
async def check_policies(project: Project) -> list[PolicyViolation]:
    """Evaluate policy rules against a project."""
    enabled_standards = project.project.compliance_standards or None
    return evaluate_policies(project, enabled_standards=enabled_standards)


@router.post("/resolve")
async def resolve_controls(project: Project) -> dict[str, Any]:
    """Resolve security controls for a project."""
    return resolve_security_controls(project)


@router.post("/risk")
async def risk_assessment(project: Project) -> RiskAssessment:
    """Calculate risk assessment for a project.

    Returns risk scores for each zone based on:
    - Security Level Target (SL-T): lower SL = higher base risk
    - Asset criticality: sum of asset criticality values
    - Exposure: number of conduits connected to the zone
    - SL Gap: difference between zone's SL-T and connected zones' SL-T
    """
    return assess_risk(project)


@router.post("/attack-paths")
async def attack_paths(project: Project) -> AttackPathAnalysis:
    """Analyze attack paths in a project."""
    return analyze_attack_paths(project)


@router.post("/generate")
async def generate(request_body: GenerateRequest) -> GenerateResponse:
    """Generate outputs from a project configuration."""
    # Reconstruct project from request
    project = Project(
        version=request_body.version,
        project=request_body.project,
        zones=request_body.zones,
        conduits=request_body.conduits,
    )
    generator = request_body.generator.lower()
    options = request_body.options

    if generator == "firewall":
        ruleset = generate_firewall_rules(
            project,
            include_deny_rules=options.get("include_deny_rules", True),
            log_allowed=options.get("log_allowed", False),
            log_denied=options.get("log_denied", True),
        )
        fw_format = options.get("format", "json")
        if fw_format == "iptables":
            from induform.generators.firewall import export_rules_iptables

            content = export_rules_iptables(ruleset)
        elif fw_format == "fortinet":
            content = export_rules_fortinet(ruleset)
        elif fw_format == "paloalto":
            content = export_rules_paloalto(ruleset)
        elif fw_format == "cisco_asa":
            content = export_rules_cisco_asa(ruleset)
        else:
            content = export_rules_json(ruleset)

    elif generator == "vlan":
        mapping = generate_vlan_mapping(
            project,
            start_vlan=options.get("start_vlan"),
        )
        content = mapping.model_dump(mode="json")

    elif generator == "report":
        content = generate_compliance_report(
            project,
            include_controls=options.get("include_controls", True),
            include_requirements=options.get("include_requirements", True),
        )

    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown generator: {generator}. Available: firewall, vlan, report",
        )

    return GenerateResponse(generator=generator, content=content)


# Zone CRUD operations


@router.get("/zones")
async def list_zones(request: Request) -> list[Zone]:
    """List all zones."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        return []

    project = Project.from_yaml(config_path)
    return project.zones


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: str, request: Request) -> Zone:
    """Get a specific zone."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)
    zone = project.get_zone(zone_id)

    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone not found: {zone_id}")

    return zone


@router.post("/zones")
async def create_zone(zone: Zone, request: Request) -> Zone:
    """Create a new zone."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Check for duplicate ID
    if project.get_zone(zone.id):
        raise HTTPException(status_code=409, detail=f"Zone already exists: {zone.id}")

    project.zones.append(zone)
    project.to_yaml(config_path)

    return zone


@router.put("/zones/{zone_id}")
async def update_zone(zone_id: str, zone: Zone, request: Request) -> Zone:
    """Update a zone."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Find and replace zone
    for i, z in enumerate(project.zones):
        if z.id == zone_id:
            project.zones[i] = zone
            project.to_yaml(config_path)
            return zone

    raise HTTPException(status_code=404, detail=f"Zone not found: {zone_id}")


@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, request: Request) -> dict[str, str]:
    """Delete a zone."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Check for conduits using this zone
    for conduit in project.conduits:
        if conduit.from_zone == zone_id or conduit.to_zone == zone_id:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete zone: used by conduit {conduit.id}",
            )

    # Find and remove zone
    for i, z in enumerate(project.zones):
        if z.id == zone_id:
            del project.zones[i]
            project.to_yaml(config_path)
            return {"status": "deleted", "zone_id": zone_id}

    raise HTTPException(status_code=404, detail=f"Zone not found: {zone_id}")


# Conduit CRUD operations


@router.get("/conduits")
async def list_conduits(request: Request) -> list[Conduit]:
    """List all conduits."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        return []

    project = Project.from_yaml(config_path)
    return project.conduits


@router.get("/conduits/{conduit_id}")
async def get_conduit(conduit_id: str, request: Request) -> Conduit:
    """Get a specific conduit."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)
    conduit = project.get_conduit(conduit_id)

    if not conduit:
        raise HTTPException(status_code=404, detail=f"Conduit not found: {conduit_id}")

    return conduit


@router.post("/conduits")
async def create_conduit(conduit: Conduit, request: Request) -> Conduit:
    """Create a new conduit."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Check for duplicate ID
    if project.get_conduit(conduit.id):
        raise HTTPException(status_code=409, detail=f"Conduit already exists: {conduit.id}")

    # Validate zone references
    if not project.get_zone(conduit.from_zone):
        raise HTTPException(status_code=400, detail=f"Unknown from_zone: {conduit.from_zone}")
    if not project.get_zone(conduit.to_zone):
        raise HTTPException(status_code=400, detail=f"Unknown to_zone: {conduit.to_zone}")

    project.conduits.append(conduit)
    project.to_yaml(config_path)

    return conduit


@router.put("/conduits/{conduit_id}")
async def update_conduit(conduit_id: str, conduit: Conduit, request: Request) -> Conduit:
    """Update a conduit."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Find and replace conduit
    for i, c in enumerate(project.conduits):
        if c.id == conduit_id:
            project.conduits[i] = conduit
            project.to_yaml(config_path)
            return conduit

    raise HTTPException(status_code=404, detail=f"Conduit not found: {conduit_id}")


@router.delete("/conduits/{conduit_id}")
async def delete_conduit(conduit_id: str, request: Request) -> dict[str, str]:
    """Delete a conduit."""
    config_path: Path = request.app.state.config_path

    if not config_path.exists():
        raise HTTPException(status_code=404, detail="Configuration not found")

    project = Project.from_yaml(config_path)

    # Find and remove conduit
    for i, c in enumerate(project.conduits):
        if c.id == conduit_id:
            del project.conduits[i]
            project.to_yaml(config_path)
            return {"status": "deleted", "conduit_id": conduit_id}

    raise HTTPException(status_code=404, detail=f"Conduit not found: {conduit_id}")


@router.get("/schema/{model}")
async def get_schema(model: str) -> dict[str, Any]:
    """Get JSON Schema for a model."""
    from induform.models.asset import Asset
    from induform.models.conduit import Conduit
    from induform.models.project import Project
    from induform.models.zone import Zone

    models = {
        "project": Project,
        "zone": Zone,
        "conduit": Conduit,
        "asset": Asset,
    }

    if model not in models:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown model: {model}. Available: {', '.join(models.keys())}",
        )

    return models[model].model_json_schema()


# Template response models

# Template endpoints moved to templates/routes.py
