"""API routes for project templates."""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from induform.api.auth.dependencies import get_current_user, get_db
from induform.api.templates.schemas import (
    TemplateCreate,
    TemplateDetail,
    TemplateSummary,
    TemplateUpdate,
)
from induform.db.models import TemplateDB, User
from induform.db.repositories.project_repository import ProjectRepository
from induform.templates import get_templates as get_builtin_templates

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/", response_model=list[TemplateSummary])
async def list_templates(
    include_builtin: bool = True,
    include_public: bool = True,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all available templates (built-in and user-created)."""
    templates: list[TemplateSummary] = []

    # Add built-in templates if requested
    if include_builtin:
        builtin = get_builtin_templates()
        for template_id, template_info in builtin.items():
            project = template_info["project"]
            zone_count = len(project.zones)
            asset_count = sum(len(z.assets) for z in project.zones)
            conduit_count = len(project.conduits)

            # Determine category from template_id
            template_category = None
            if "manufacturing" in template_id:
                template_category = "manufacturing"
            elif "water" in template_id:
                template_category = "utility"
            elif "power" in template_id:
                template_category = "utility"
            elif "purdue" in template_id:
                template_category = "reference"

            # Apply category filter
            if category and template_category != category:
                continue

            templates.append(
                TemplateSummary(
                    id=f"builtin:{template_id}",
                    name=template_info["name"],
                    description=template_info["description"],
                    category=template_category,
                    owner_id="system",
                    owner_username="InduForm",
                    is_public=True,
                    is_builtin=True,
                    zone_count=zone_count,
                    asset_count=asset_count,
                    conduit_count=conduit_count,
                )
            )

    # Query user templates
    query = select(TemplateDB).where(
        or_(
            TemplateDB.owner_id == current_user.id,
            TemplateDB.is_public == True if include_public else False,  # noqa: E712
        )
    )

    if category:
        query = query.where(TemplateDB.category == category)

    query = query.order_by(TemplateDB.created_at.desc())
    result = await db.execute(query)
    user_templates = result.scalars().all()

    for template in user_templates:
        # Get owner username
        owner_query = select(User).where(User.id == template.owner_id)
        owner_result = await db.execute(owner_query)
        owner = owner_result.scalar_one_or_none()

        templates.append(
            TemplateSummary(
                id=template.id,
                name=template.name,
                description=template.description,
                category=template.category,
                owner_id=template.owner_id,
                owner_username=owner.username if owner else None,
                is_public=template.is_public,
                is_builtin=False,
                zone_count=template.zone_count,
                asset_count=template.asset_count,
                conduit_count=template.conduit_count,
                created_at=template.created_at,
                updated_at=template.updated_at,
            )
        )

    return templates


@router.get("/{template_id}", response_model=TemplateDetail)
async def get_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific template by ID."""
    # Check if it's a built-in template
    if template_id.startswith("builtin:"):
        builtin_id = template_id.replace("builtin:", "")
        builtin = get_builtin_templates()
        if builtin_id not in builtin:
            raise HTTPException(status_code=404, detail="Template not found")

        template_info = builtin[builtin_id]
        project = template_info["project"]

        template_category = None
        if "manufacturing" in builtin_id:
            template_category = "manufacturing"
        elif "water" in builtin_id:
            template_category = "utility"
        elif "power" in builtin_id:
            template_category = "utility"
        elif "purdue" in builtin_id:
            template_category = "reference"

        return TemplateDetail(
            id=template_id,
            name=template_info["name"],
            description=template_info["description"],
            category=template_category,
            owner_id="system",
            owner_username="InduForm",
            is_public=True,
            is_builtin=True,
            zone_count=len(project.zones),
            asset_count=sum(len(z.assets) for z in project.zones),
            conduit_count=len(project.conduits),
            project=project.model_dump(),
        )

    # Get user template from database
    query = select(TemplateDB).where(TemplateDB.id == template_id)
    result = await db.execute(query)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Check access (owner or public)
    if template.owner_id != current_user.id and not template.is_public:
        raise HTTPException(status_code=403, detail="Access denied")

    # Get owner username
    owner_query = select(User).where(User.id == template.owner_id)
    owner_result = await db.execute(owner_query)
    owner = owner_result.scalar_one_or_none()

    return TemplateDetail(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        owner_id=template.owner_id,
        owner_username=owner.username if owner else None,
        is_public=template.is_public,
        is_builtin=False,
        zone_count=template.zone_count,
        asset_count=template.asset_count,
        conduit_count=template.conduit_count,
        created_at=template.created_at,
        updated_at=template.updated_at,
        project=json.loads(template.project_json),
    )


@router.post("/", response_model=TemplateSummary)
async def create_template(
    data: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new template from an existing project."""
    # Use repository to get and convert project
    repo = ProjectRepository(db)
    project_db = await repo.get_by_id(data.project_id, load_relations=True)

    if not project_db:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check project access (owner or editor)
    from induform.security.permissions import Permission, check_project_permission

    has_access = await check_project_permission(
        db, data.project_id, current_user.id, Permission.EDITOR, is_admin=current_user.is_admin
    )
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to create templates from this project",
        )

    # Calculate counts
    zone_count = len(project_db.zones)
    asset_count = sum(len(z.assets) for z in project_db.zones)
    conduit_count = len(project_db.conduits)

    # Convert to Pydantic project using repository method
    project = await repo.to_pydantic(project_db)

    # Create template
    template = TemplateDB(
        name=data.name,
        description=data.description,
        category=data.category,
        owner_id=current_user.id,
        is_public=data.is_public,
        project_json=project.model_dump_json(),
        zone_count=zone_count,
        asset_count=asset_count,
        conduit_count=conduit_count,
    )

    db.add(template)
    await db.commit()
    await db.refresh(template)

    return TemplateSummary(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        owner_id=template.owner_id,
        owner_username=current_user.username,
        is_public=template.is_public,
        is_builtin=False,
        zone_count=template.zone_count,
        asset_count=template.asset_count,
        conduit_count=template.conduit_count,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.put("/{template_id}", response_model=TemplateSummary)
async def update_template(
    template_id: str,
    data: TemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a template's metadata."""
    if template_id.startswith("builtin:"):
        raise HTTPException(status_code=400, detail="Cannot modify built-in templates")

    query = select(TemplateDB).where(TemplateDB.id == template_id)
    result = await db.execute(query)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only template owner can modify")

    # Update fields
    if data.name is not None:
        template.name = data.name
    if data.description is not None:
        template.description = data.description
    if data.category is not None:
        template.category = data.category
    if data.is_public is not None:
        template.is_public = data.is_public

    template.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(template)

    return TemplateSummary(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        owner_id=template.owner_id,
        owner_username=current_user.username,
        is_public=template.is_public,
        is_builtin=False,
        zone_count=template.zone_count,
        asset_count=template.asset_count,
        conduit_count=template.conduit_count,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a user-created template."""
    if template_id.startswith("builtin:"):
        raise HTTPException(status_code=400, detail="Cannot delete built-in templates")

    query = select(TemplateDB).where(TemplateDB.id == template_id)
    result = await db.execute(query)
    template = result.scalar_one_or_none()

    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    if template.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only template owner can delete")

    await db.delete(template)
    await db.commit()

    return {"message": "Template deleted successfully"}
