"""SKILL.md 结构契约校验器（stdlib-only）。

契约：
- frontmatter（`---` 围栏）必含 name、description
- description ≥40 字符，且含领域触发词表中至少 3 个词
- 正文必含标题：## 何时使用 / ## 流程 / ## 硬闸与自检 / ## 产出与格式

用法：python3 tools/skill_lint.py <skill_dir>
问题非空则 exit 1。
"""

from __future__ import annotations

import sys
from pathlib import Path

TRIGGER_WORDS = [
    "漫剧", "短剧", "剧本", "分镜", "出图", "出片",
    "小说", "人物", "场景", "即梦", "Seedance",
]
REQUIRED_HEADINGS = [
    "## 何时使用",
    "## 流程",
    "## 硬闸与自检",
    "## 产出与格式",
]
MIN_DESCRIPTION_LENGTH = 40
MIN_TRIGGER_WORDS = 3


def _split_frontmatter(text: str) -> tuple[dict[str, str] | None, str]:
    """拆分 frontmatter 与正文。返回 (meta, body)；meta 为 None 表示缺 frontmatter。"""
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, text
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            meta: dict[str, str] = {}
            for line in lines[1:i]:
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                key, sep, value = line.partition(":")
                if sep:
                    meta[key.strip()] = value.strip()
            return meta, "\n".join(lines[i + 1:])
    return None, text


def lint(skill_dir: Path) -> list[str]:
    """校验 skill_dir/SKILL.md 结构契约，返回问题清单（空=通过）。"""
    skill_md = Path(skill_dir) / "SKILL.md"
    if not skill_md.is_file():
        return [f"缺文件: {skill_md}"]

    meta, body = _split_frontmatter(skill_md.read_text(encoding="utf-8"))
    problems: list[str] = []
    if meta is None:
        problems.append("缺 frontmatter（以 --- 围栏开头）")
        meta = {}

    if not meta.get("name"):
        problems.append("frontmatter 缺字段: name")

    description = meta.get("description", "")
    if not description:
        problems.append("frontmatter 缺字段: description")
    else:
        if len(description) < MIN_DESCRIPTION_LENGTH:
            problems.append(
                f"description 不足 {MIN_DESCRIPTION_LENGTH} 字符（当前 {len(description)}）"
            )
        hits = sum(1 for word in TRIGGER_WORDS if word in description)
        if hits < MIN_TRIGGER_WORDS:
            problems.append(
                f"description 缺领域触发词（至少 {MIN_TRIGGER_WORDS} 个，当前 {hits} 个）"
            )

    body_lines = {line.strip() for line in body.splitlines()}
    for heading in REQUIRED_HEADINGS:
        if heading not in body_lines:
            problems.append(f"缺标题: {heading}")

    return problems


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("用法: python3 tools/skill_lint.py <skill_dir>", file=sys.stderr)
        return 2
    problems = lint(Path(argv[1]))
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
