import subprocess
import sys
import tempfile
import tomllib
import unittest
from pathlib import Path

INSTALL = Path(__file__).resolve().parents[1] / "scripts/install.py"
ROLES = ("spv-plan-reviewer", "spv-builder", "spv-verifier")


class InstallTest(unittest.TestCase):
    def invoke(self, project, harness, *args):
        return subprocess.run(
            [sys.executable, str(INSTALL), "--project", str(project), "--harness", harness, *args],
            capture_output=True,
            text=True,
        )

    def test_all_harnesses_install_complete_kit(self):
        for harness, native, skills, suffix in (
            ("generic", None, None, None),
            ("codex", ".codex/agents", ".agents/skills", ".toml"),
            ("claude", ".claude/agents", ".claude/skills", ".md"),
            ("opencode", ".opencode/agents", ".opencode/skills", ".md"),
        ):
            with self.subTest(harness=harness), tempfile.TemporaryDirectory() as tmp:
                project = Path(tmp)
                result = self.invoke(project, harness)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertTrue((project / ".spv/START.md").is_file())
                self.assertTrue((project / ".spv/agents/spv-coordinator.md").is_file())
                self.assertTrue((project / ".spv/skills/spv-accessibility/references/checklist.md").is_file())
                if native:
                    for name in ROLES:
                        profile = (project / native / f"{name}{suffix}").read_text(encoding="utf-8")
                        if harness == "codex":
                            config = tomllib.loads(profile)
                            self.assertEqual(config["name"], name)
                            self.assertTrue(config["developer_instructions"])
                    self.assertTrue((project / skills / "spv-accessibility/SKILL.md").is_file())
                else:
                    self.assertEqual(list(project.iterdir()), [project / ".spv"])
                repeat = self.invoke(project, harness)
                self.assertEqual(repeat.returncode, 0, repeat.stderr)
                self.assertIn("already current", repeat.stdout)

    def test_dry_run_leaves_project_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            result = self.invoke(project, "codex", "--dry-run")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Would write .codex/agents/spv-builder.toml", result.stdout)
            self.assertEqual(list(project.iterdir()), [])

    def test_conflict_preserves_existing_agent_and_prevents_partial_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            profile = project / ".claude/agents/spv-builder.md"
            profile.parent.mkdir(parents=True)
            profile.write_text("existing profile", encoding="utf-8")
            result = self.invoke(project, "claude")
            self.assertEqual(result.returncode, 2, result.stderr)
            self.assertEqual(profile.read_text(encoding="utf-8"), "existing profile")
            self.assertFalse((project / ".spv").exists())


if __name__ == "__main__":
    unittest.main()
