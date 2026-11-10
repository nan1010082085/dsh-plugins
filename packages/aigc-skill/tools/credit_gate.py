"""credit_gate — 花钱门（spending gate）。

包装生成命令（默认 dreamina-canvas 风格；其他后端注入自定义 runner/parser，见 shared/backends.md），保证：
1. 批准为假值（None/空串等）绝不执行任何命令，直接抛 PermissionError；
2. 批准后把积分上限 --credit-ceiling <max_credits> 透传给执行器，
   且 cmd 内预置的 --credit-ceiling 一律剥离——花钱门独占 ceiling；
3. quote 干跑报价可注入 runner，便于离线测试；报价失败/无效必须抛错，
   禁止静默产出 None 上限。

仅用 stdlib；执行器可注入（默认 subprocess.run），测试不得触达真实 CLI。
"""

from __future__ import annotations

import json
import subprocess
from typing import Any, Callable, List, Optional, Sequence

Runner = Callable[..., Any]


def quote(
    cmd: Sequence[str],
    runner: Optional[Runner] = None,
) -> dict:
    """调用 node quote 类命令做 dry 报价，解析 JSON 返回。

    默认执行 subprocess.run(cmd, capture_output=True, text=True)，
    解析 {"data": {"items": [...], "totalMaxCredits": N}} 形状的输出，
    返回 {"total_max_credits": N, "items": [...]}。

    非零 returncode 抛 RuntimeError；totalMaxCredits 缺失或非 int 抛 ValueError
    ——绝不返回 None 上限。
    """
    runner = runner if runner is not None else subprocess.run
    result = runner(list(cmd), capture_output=True, text=True)
    returncode = result if isinstance(result, int) else getattr(result, "returncode", 0)
    if returncode != 0:
        raise RuntimeError(f"quote 命令失败 returncode={returncode}: {list(cmd)}")
    stdout = result.stdout if not isinstance(result, int) else ""
    if isinstance(stdout, bytes):
        stdout = stdout.decode("utf-8")
    try:
        payload = json.loads(stdout)
    except ValueError as exc:
        raise ValueError(f"quote 输出不是合法 JSON: {stdout!r}") from exc
    data = payload.get("data", payload) if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise ValueError(f"quote 输出结构非法: {payload!r}")
    total = data.get("totalMaxCredits")
    if not isinstance(total, int):
        raise ValueError(
            f"quote 结果缺少合法的 totalMaxCredits（必须是 int），得到 {total!r}"
        )
    return {
        "total_max_credits": total,
        "items": data.get("items", []),
    }


def _strip_credit_ceiling(cmd: Sequence[str]) -> List[str]:
    """剥离命令里预置的 --credit-ceiling 及其值（含 --credit-ceiling=N 形式）。"""
    stripped: List[str] = []
    skip_next = False
    for token in cmd:
        if skip_next:
            skip_next = False
            continue
        if token == "--credit-ceiling":
            skip_next = True
            continue
        if token.startswith("--credit-ceiling="):
            continue
        stripped.append(token)
    return stripped


def run(
    cmd: Sequence[str],
    approved_by: Optional[str],
    max_credits: int,
    executor: Optional[Runner] = None,
) -> int:
    """执行花钱命令；approved_by 为假值或纯空白一律拒绝。

    批准后剥离 cmd 预置的 --credit-ceiling，再追加 --credit-ceiling <max_credits>，
    调用执行器并返回其 return code。max_credits 必须是真 int（bool 也拒）。
    """
    if not (approved_by or "").strip():
        raise PermissionError(
            "花钱门拒绝：未获批准（approved_by 为空），不得执行任何生成命令"
        )
    if type(max_credits) is not int:
        raise ValueError(f"max_credits 必须是 int，得到 {max_credits!r}")
    executor = executor if executor is not None else subprocess.run
    full_cmd = _strip_credit_ceiling(cmd) + ["--credit-ceiling", str(max_credits)]
    result = executor(full_cmd)
    if isinstance(result, int):
        return result
    return result.returncode
