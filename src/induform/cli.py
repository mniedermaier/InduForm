"""InduForm CLI - Typer-based command line interface."""

import json
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from induform.engine.policy import evaluate_policies
from induform.engine.validator import ValidationSeverity, validate_yaml_file
from induform.generators.compliance import generate_compliance_report
from induform.generators.firewall import export_rules_json, generate_firewall_rules
from induform.generators.vlan import export_vlan_csv, generate_vlan_mapping
from induform.models.project import Project, ProjectMetadata

app = typer.Typer(
    name="induform",
    help="Industrial Terraform - Declarative IEC 62443 zone/conduit security for OT networks",
    no_args_is_help=True,
)

console = Console()


@app.command()
def init(
    name: Annotated[str, typer.Option("--name", "-n", help="Project name")] = "My OT Project",
    output: Annotated[Path, typer.Option("--output", "-o", help="Output file path")] = Path(
        "induform.yaml"
    ),
    force: Annotated[bool, typer.Option("--force", "-f", help="Overwrite existing file")] = False,
) -> None:
    """Initialize a new InduForm project configuration."""
    if output.exists() and not force:
        console.print(f"[red]Error:[/red] File {output} already exists. Use --force to overwrite.")
        raise typer.Exit(1)

    # Create a minimal starter project
    project = Project(
        version="1.0",
        project=ProjectMetadata(
            name=name,
            description="Auto-generated InduForm project",
            standard="IEC62443",
        ),
        zones=[],
        conduits=[],
    )

    project.to_yaml(output)
    console.print(f"[green]Created[/green] {output}")
    console.print("\nNext steps:")
    console.print("  1. Edit the configuration file to add zones and conduits")
    console.print("  2. Run 'induform validate' to check your configuration")
    console.print("  3. Run 'induform generate report' to create a compliance report")


@app.command()
def validate(
    config: Annotated[Path, typer.Argument(help="Path to configuration file")] = Path(
        "induform.yaml"
    ),
    strict: Annotated[
        bool, typer.Option("--strict", "-s", help="Treat warnings as errors")
    ] = False,
    json_output: Annotated[bool, typer.Option("--json", help="Output as JSON")] = False,
) -> None:
    """Validate a configuration file against schema and IEC 62443 policies."""
    if not config.exists():
        console.print(f"[red]Error:[/red] Configuration file not found: {config}")
        raise typer.Exit(1)

    try:
        report = validate_yaml_file(config, strict=strict)
    except Exception as e:
        console.print(f"[red]Error parsing configuration:[/red] {e}")
        raise typer.Exit(1)

    if json_output:
        print(json.dumps(report.model_dump(), indent=2))
        raise typer.Exit(0 if report.valid else 1)

    # Display results as table
    if report.results:
        table = Table(title="Validation Results")
        table.add_column("Severity", style="bold")
        table.add_column("Code")
        table.add_column("Message")
        table.add_column("Location")

        for result in report.results:
            severity_style = {
                ValidationSeverity.ERROR: "red",
                ValidationSeverity.WARNING: "yellow",
                ValidationSeverity.INFO: "blue",
            }.get(result.severity, "white")

            table.add_row(
                f"[{severity_style}]{result.severity.value.upper()}[/{severity_style}]",
                result.code,
                result.message[:60] + "..." if len(result.message) > 60 else result.message,
                result.location or "-",
            )

        console.print(table)
        console.print()

    # Summary
    if report.valid:
        console.print("[green]Validation passed[/green]")
    else:
        console.print("[red]Validation failed[/red]")

    console.print(
        f"  Errors: {report.error_count}, "
        f"Warnings: {report.warning_count}, "
        f"Info: {report.info_count}"
    )

    raise typer.Exit(0 if report.valid else 1)


@app.command()
def generate(
    generator: Annotated[str, typer.Argument(help="Generator type: firewall, vlan, or report")],
    config: Annotated[
        Path, typer.Option("--config", "-c", help="Path to configuration file")
    ] = Path("induform.yaml"),
    output: Annotated[Path | None, typer.Option("--output", "-o", help="Output file path")] = None,
    format: Annotated[
        str, typer.Option("--format", "-f", help="Output format (json, csv, md, iptables, cisco)")
    ] = "json",
) -> None:
    """Generate outputs from a configuration file."""
    if not config.exists():
        console.print(f"[red]Error:[/red] Configuration file not found: {config}")
        raise typer.Exit(1)

    try:
        project = Project.from_yaml(config)
    except Exception as e:
        console.print(f"[red]Error parsing configuration:[/red] {e}")
        raise typer.Exit(1)

    generator_lower = generator.lower()

    if generator_lower == "firewall":
        ruleset = generate_firewall_rules(project)
        if format == "json":
            content = json.dumps(export_rules_json(ruleset), indent=2)
        elif format == "iptables":
            from induform.generators.firewall import export_rules_iptables

            content = export_rules_iptables(ruleset)
        else:
            console.print(f"[red]Error:[/red] Unsupported format for firewall: {format}")
            raise typer.Exit(1)

    elif generator_lower == "vlan":
        mapping = generate_vlan_mapping(project)
        if format == "json":
            content = json.dumps(mapping.model_dump(mode="json"), indent=2)
        elif format == "csv":
            content = export_vlan_csv(mapping)
        elif format == "cisco":
            from induform.generators.vlan import export_vlan_cisco

            content = export_vlan_cisco(mapping)
        else:
            console.print(f"[red]Error:[/red] Unsupported format for vlan: {format}")
            raise typer.Exit(1)

    elif generator_lower == "report":
        content = generate_compliance_report(project)
        format = "md"  # Report is always markdown

    else:
        console.print(f"[red]Error:[/red] Unknown generator: {generator}")
        console.print("Available generators: firewall, vlan, report")
        raise typer.Exit(1)

    # Output
    if output:
        output.write_text(content)
        console.print(f"[green]Generated[/green] {output}")
    else:
        print(content)


@app.command()
def schema(
    model: Annotated[
        str, typer.Option("--model", "-m", help="Model to export: project, zone, conduit, asset")
    ] = "project",
) -> None:
    """Export JSON Schema for configuration validation."""
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
        console.print(f"[red]Error:[/red] Unknown model: {model}")
        console.print(f"Available models: {', '.join(models.keys())}")
        raise typer.Exit(1)

    schema = models[model].model_json_schema()
    print(json.dumps(schema, indent=2))


@app.command()
def serve(
    config: Annotated[
        Path | None, typer.Option("--config", "-c", help="Path to configuration file")
    ] = None,
    host: Annotated[str, typer.Option("--host", "-h", help="Host to bind to")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", "-p", help="Port to listen on")] = 8080,
    reload: Annotated[bool, typer.Option("--reload", help="Enable auto-reload")] = False,
) -> None:
    """Start the InduForm web server."""
    import os

    import uvicorn

    # Use config from argument, environment variable, or default
    if config is None:
        config_path = Path(os.environ.get("INDUFORM_CONFIG", "induform.yaml"))
    else:
        config_path = config

    # Set config path for the API server
    os.environ["INDUFORM_CONFIG"] = str(config_path.absolute())

    console.print("[green]Starting InduForm server[/green]")
    console.print(f"  Config: {config_path}")
    console.print(f"  URL: http://{host}:{port}")
    console.print(f"  API Docs: http://{host}:{port}/docs")
    console.print()

    uvicorn.run(
        "induform.api.server:app",
        host=host,
        port=port,
        reload=reload,
    )


# Database subcommands
db_app = typer.Typer(help="Database management commands")
app.add_typer(db_app, name="db")


@db_app.command("migrate")
def db_migrate(
    db_path: Annotated[Path | None, typer.Option("--db", "-d", help="Database file path")] = None,
    revision: Annotated[str, typer.Option("--revision", "-r", help="Target revision")] = "head",
) -> None:
    """Run database migrations using Alembic."""
    import os as _os

    if db_path:
        _os.environ["INDUFORM_DB"] = str(db_path)

    from alembic.config import Config

    from alembic import command

    # Find alembic.ini relative to package
    alembic_ini = Path(__file__).parent.parent.parent / "alembic.ini"
    if not alembic_ini.exists():
        # Try current working directory
        alembic_ini = Path("alembic.ini")

    if not alembic_ini.exists():
        console.print("[red]Error:[/red] alembic.ini not found")
        raise typer.Exit(1)

    alembic_cfg = Config(str(alembic_ini))

    console.print(f"[blue]Running migrations to revision:[/blue] {revision}")
    command.upgrade(alembic_cfg, revision)
    console.print("[green]Migrations applied successfully[/green]")


@db_app.command("init")
def db_init(
    db_path: Annotated[Path | None, typer.Option("--db", "-d", help="Database file path")] = None,
    force: Annotated[bool, typer.Option("--force", "-f", help="Drop and recreate tables")] = False,
) -> None:
    """Initialize the database and create all tables."""
    import asyncio
    import os

    from induform.db import close_db, init_db
    from induform.db.database import get_database_url

    if db_path:
        os.environ["INDUFORM_DB"] = str(db_path)

    db_url = get_database_url()
    db_file = db_url.replace("sqlite+aiosqlite:///", "")

    async def _init():
        if force and Path(db_file).exists():
            console.print(f"[yellow]Dropping existing database:[/yellow] {db_file}")
            Path(db_file).unlink()

        await init_db(db_url)
        console.print(f"[green]Database initialized:[/green] {db_file}")

        # List created tables
        from induform.db.models import Base

        tables = list(Base.metadata.tables.keys())
        console.print(f"  Tables: {', '.join(tables)}")

        await close_db()

    asyncio.run(_init())


@db_app.command("backup")
def db_backup(
    db_path: Annotated[Path | None, typer.Option("--db", "-d", help="Database file path")] = None,
    output: Annotated[Path | None, typer.Option("--output", "-o", help="Backup file path")] = None,
) -> None:
    """Create a backup of the database."""
    import os
    import shutil
    from datetime import datetime as _dt

    from induform.db.database import get_database_url

    if db_path:
        os.environ["INDUFORM_DB"] = str(db_path)

    db_url = get_database_url()

    if "sqlite" not in db_url:
        console.print("[red]Error:[/red] Backup command only supports SQLite databases.")
        console.print("For PostgreSQL, use pg_dump instead.")
        raise typer.Exit(1)

    db_file = Path(db_url.replace("sqlite+aiosqlite:///", ""))

    if not db_file.exists():
        console.print(f"[red]Error:[/red] Database not found: {db_file}")
        raise typer.Exit(1)

    if output is None:
        timestamp = _dt.utcnow().strftime("%Y%m%d_%H%M%S")
        output = db_file.parent / f"{db_file.stem}_backup_{timestamp}{db_file.suffix}"

    shutil.copy2(str(db_file), str(output))
    size_kb = output.stat().st_size / 1024
    console.print(f"[green]Backup created:[/green] {output} ({size_kb:.1f} KB)")


@db_app.command("status")
def db_status(
    db_path: Annotated[Path | None, typer.Option("--db", "-d", help="Database file path")] = None,
) -> None:
    """Show database status and statistics."""
    import asyncio
    import os

    from sqlalchemy import text

    from induform.db import close_db, init_db
    from induform.db.database import get_database_url, get_engine

    if db_path:
        os.environ["INDUFORM_DB"] = str(db_path)

    db_url = get_database_url()
    db_file = db_url.replace("sqlite+aiosqlite:///", "")

    if not Path(db_file).exists():
        console.print(f"[red]Database not found:[/red] {db_file}")
        console.print("Run 'induform db init' to create the database.")
        raise typer.Exit(1)

    async def _status():
        await init_db(db_url)

        engine = get_engine()
        async with engine.connect() as conn:
            # Get table counts
            table = Table(title="Database Status")
            table.add_column("Table")
            table.add_column("Count", justify="right")

            tables = ["users", "teams", "projects", "zones", "assets", "conduits", "comments"]
            for tbl in tables:
                try:
                    result = await conn.execute(text(f"SELECT COUNT(*) FROM {tbl}"))
                    count = result.scalar()
                    table.add_row(tbl, str(count))
                except Exception:
                    table.add_row(tbl, "[dim]N/A[/dim]")

            console.print(table)

        await close_db()

    console.print(f"[blue]Database:[/blue] {db_file}")
    console.print(f"[blue]Size:[/blue] {Path(db_file).stat().st_size / 1024:.1f} KB")
    console.print()

    asyncio.run(_status())


@app.command()
def policies(
    config: Annotated[Path, typer.Argument(help="Path to configuration file")] = Path(
        "induform.yaml"
    ),
    json_output: Annotated[bool, typer.Option("--json", help="Output as JSON")] = False,
) -> None:
    """Evaluate policy rules against a configuration."""
    if not config.exists():
        console.print(f"[red]Error:[/red] Configuration file not found: {config}")
        raise typer.Exit(1)

    try:
        project = Project.from_yaml(config)
    except Exception as e:
        console.print(f"[red]Error parsing configuration:[/red] {e}")
        raise typer.Exit(1)

    violations = evaluate_policies(project)

    if json_output:
        print(json.dumps([v.model_dump() for v in violations], indent=2))
        raise typer.Exit(0 if not violations else 1)

    if not violations:
        console.print("[green]All policy rules passed[/green]")
        raise typer.Exit(0)

    table = Table(title="Policy Violations")
    table.add_column("Severity", style="bold")
    table.add_column("Rule")
    table.add_column("Message")
    table.add_column("Affected")

    for violation in violations:
        severity_style = {
            "critical": "red bold",
            "high": "red",
            "medium": "yellow",
            "low": "blue",
        }.get(violation.severity.value, "white")

        affected = ", ".join(violation.affected_entities[:2])
        if len(violation.affected_entities) > 2:
            affected += "..."

        table.add_row(
            f"[{severity_style}]{violation.severity.value.upper()}[/{severity_style}]",
            f"{violation.rule_id}: {violation.rule_name}",
            violation.message[:50] + "..." if len(violation.message) > 50 else violation.message,
            affected,
        )

    console.print(table)
    console.print(f"\n[red]{len(violations)} policy violation(s) found[/red]")
    raise typer.Exit(1)


if __name__ == "__main__":
    app()
