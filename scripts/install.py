"""Install the SPV prompts, skill, and optional native agents into a project."""

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILL = Path("skills/spv-accessibility")
HARNESSES = {
    "codex": (Path(".codex/agents"), Path(".agents/skills")),
    "claude": (Path(".claude/agents"), Path(".claude/skills")),
    "opencode": (Path(".opencode/agents"), Path(".opencode/skills")),
}
ROLES = {
    "spv-plan-reviewer": "Review an SPV plan and the developer's answer before implementation.",
    "spv-builder": "Implement a developer-approved SPV plan or repair a verified failure.",
    "spv-verifier": "Test the exact SPV candidate and report scoped accessibility evidence.",
}


def native_agent(harness, name, description, prompt):
    if harness == "codex":
        return (
            f"name = {json.dumps(name)}\n"
            f"description = {json.dumps(description)}\n"
            f"developer_instructions = {json.dumps(prompt, ensure_ascii=False)}\n"
        )
    fields = [f"description: {json.dumps(description)}"]
    if harness == "claude":
        fields.insert(0, f"name: {name}")
        if name == "spv-plan-reviewer":
            fields.append("tools: Read, Glob, Grep")
    else:
        fields.append("mode: subagent")
    return "---\n" + "\n".join(fields) + "\n---\n\n" + prompt


def installation(harness):
    agents = {path.relative_to(ROOT): path.read_bytes() for path in (ROOT / "agents").glob("*.md")}
    skill = {path.relative_to(ROOT): path.read_bytes() for path in (ROOT / SKILL).rglob("*.md")}
    files = {Path(".spv") / path: data for path, data in (agents | skill).items()}
    files[Path(".spv/START.md")] = (ROOT / "START.md").read_bytes()

    if harness in HARNESSES:
        agent_dir, skill_dir = HARNESSES[harness]
        suffix = ".toml" if harness == "codex" else ".md"
        for name, description in ROLES.items():
            prompt = agents[Path("agents") / f"{name}.md"].decode("utf-8")
            files[agent_dir / f"{name}{suffix}"] = native_agent(
                harness, name, description, prompt
            ).encode("utf-8")
        files.update({skill_dir / path.relative_to("skills"): data for path, data in skill.items()})
    return files


def install(project, harness, dry_run):
    files = installation(harness)
    missing = []
    conflicts = []
    for relative, data in sorted(files.items()):
        path = project / relative
        if not path.resolve().is_relative_to(project) or path.is_symlink():
            conflicts.append(str(relative))
        elif path.is_file() and path.read_bytes() == data:
            continue
        elif path.exists() or any(
            parent.exists() and not parent.is_dir()
            for parent in path.parents if parent != project
        ):
            conflicts.append(str(relative))
        else:
            missing.append((relative, data))
    if conflicts:
        raise ValueError("Existing paths conflict with SPV: " + ", ".join(conflicts))

    for relative, data in missing:
        if not dry_run:
            path = project / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("xb") as stream:
                stream.write(data)
        print(f"{'Would write' if dry_run else 'Installed'} {relative.as_posix()}")
    if not missing:
        print("SPV files are already current.")
    print("Start with .spv/START.md in the target project.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", type=Path, required=True, help="Existing project directory")
    parser.add_argument("--harness", choices=(*HARNESSES, "generic"), default="generic")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing files")
    args = parser.parse_args()
    try:
        project = args.project.resolve(strict=True)
        if not project.is_dir():
            raise ValueError("The project must be a directory.")
        install(project, args.harness, args.dry_run)
    except (OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
