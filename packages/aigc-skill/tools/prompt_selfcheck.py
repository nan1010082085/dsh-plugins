"""prompt_selfcheck —— 提示词合规闸（非创作闸，6 项机检）。

定位（2026-11-05 用户令）：**一切产出、检查、校验是合规，不是限制模型、限制发挥、限制创作。**
本闸只拦合规风险——平台审核违禁词、裸英文运镜（后端不识别=白烧积分）、多镜缺时间码（机器
不可读）、refs 超限（素材挂载风险）、重复块（拼装手误）、每镜信息量不足（≥250 字保底）；
不拦创作自由——字数无上限、风格/叙事/镜头语言完全放开。报「缺料」只提示补什么，不规定怎么写。
新增检查项前自问：不拦会有什么合规或资损后果？答不上来 = 创作枷锁，不许加。

检查项：
① 中文提示词长度：video ≥250 字保底（每镜保底用户令，多镜单视频按每镜分段计）。
   **无字数上限**（2026-11-05 用户令「不应该有这种红线」废除 500 字上限；五道硬闸 1
   本就写明每镜不限字数；苗疆合集实证 seedance_2.5 正常出片 917–1288 字）。
   长度上限属后端方言（backends.md），即梦/seedance 无上限。
② 时间片格式：至少一处「\\d+[–-]\\d+ ?秒」（如 0–3 秒）
③ 违禁废话词：4K / 8K / 杰作 / 超清晰 / 大师作 / wallpaper（拉丁词忽略大小写）
④ 裸英文运镜词：pan / zoom / dolly / tilt / crane / tracking shot 以独立词形态
   出现即报（ASCII 字母数字边界，中英无空格混排同样命中；panorama/company 等不误报；
   中文提示词只写中文运镜名，英文运镜词必须中译；词表见 shared/camera-dictionary.md）
⑤ 素材映射 refs 数量 ≤9
⑥ 重复块检测：【】节标题或 ≥10 字整行出现两次即报（规格块拼装手误，样本实证【光线】重复两次）
⑦ 时间轴对时（--duration 提供时启用）：分镜时间覆盖总长必须=生成时长 ±0.5s。
   成片实测（2026-11-05 ffprobe）：成片时长精确等于 durationSeconds，指令时间码不是模型
   时间轴——覆盖超出部分被模型压缩/砍掉（实测 8.0s 覆盖→4.06s 成片、12.5s→8.06s）。
   不对时=翻车重烧积分（合规/资损闸；不限创作：怎么拍随便，拍多久要对上账）

用法：
- 函数：prompt_selfcheck.check(prompt: str, refs: list[str], mode: str = "video") -> list[str]
  （mode：video=出视频分镜 prompt（默认）/ image=出图 prompt；返回问题清单，空 = 通过）
- 命令行：python3 tools/prompt_selfcheck.py [--mode image|video] <prompt_file> [ref ...]
  问题非空则 exit 1。

仅用 stdlib。
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path
from typing import List

MIN_PROMPT_CHARS = 250  # 每镜 ≥250 字保底（五道硬闸 1 用户令；出视频分镜适用）
MODES = ("image", "video")  # 仅区分适用规则，不做字数上限（上限=后端方言，见 backends.md）
TIME_SLICE_PATTERN = re.compile(
    r"\d+[–—-]\d+ ?秒"  # 时间片式：0–3 秒
    r"|\d{1,2}:\d{2}(?:\.\d+)?\s*[–—-]\s*\d{1,2}:\d{2}"  # 时间码式：01:49.90—01:51.90（2026-11-05 样本口径）
)
BANNED_WORDS = ["4K", "8K", "杰作", "超清晰", "大师作", "wallpaper"]
BARE_ENGLISH_CAMERA_WORDS = ["pan", "zoom", "dolly", "tilt", "crane"]
BARE_ENGLISH_CAMERA_PHRASES = ["tracking shot"]
MAX_REFS = 9


def _prompt_length(text: str) -> int:
    """提示词长度：中文字符（CJK 表意文字）+ 标点，其余不计。"""
    count = 0
    for ch in text:
        if "一" <= ch <= "鿿" or "㐀" <= ch <= "䶿":
            count += 1
        elif unicodedata.category(ch).startswith("P"):
            count += 1
    return count


def check(prompt: str, refs: List[str], mode: str = "video", duration: "float | None" = None) -> List[str]:
    """合规机检，返回问题清单（空 = 通过）。mode：video（默认）/ image。
    duration：生成时长（秒）；提供时启用 ⑦ 时间轴对时检查。"""
    if mode not in MODES:
        raise ValueError(f"mode 仅支持 {MODES}，收到 {mode!r}")
    problems: List[str] = []

    # ① 长度：video ≥250 字保底（每镜，用户令）；无字数上限（2026-11-05 用户令废除上限红线）
    length = _prompt_length(prompt)
    if mode == "video" and length < MIN_PROMPT_CHARS:
        problems.append(f"① 提示词不足 {MIN_PROMPT_CHARS} 中文字符（当前 {length} 字）——补细节")

    # ② 时间片/时间码格式：多镜指令（含「镜头N」「分镜N」标记）必须带时间码；
    #    单镜自由段落（无镜号，样本实证合法变体）豁免
    if re.search(r"(?:镜头|分镜)\s*\d+", prompt) and not TIME_SLICE_PATTERN.search(prompt):
        problems.append("② 时间片格式缺失：多镜指令至少一处「数字–数字 秒」或「mm:ss—mm:ss」时间码")

    # ③ 违禁词（拉丁词忽略大小写；4K/8K 按独立词+字母数字边界匹配——防色温「4800K」
    #    与 node ID 子串（实证 node_5298y8kbk7）误杀；画幅/分辨率语境的「16:9，4K」是
    #    分辨率声明不是废话词，跳过——语境含上一行（画幅标题与数值常分行写））
    prev_line = ""
    for line in prompt.splitlines():
        lowered = line.lower()
        context = prev_line + " " + line
        for word in BANNED_WORDS:
            if word in ("4K", "8K"):
                if not re.search(rf"(?<![0-9A-Za-z]){word.lower()}(?![0-9A-Za-z])", lowered):
                    continue
                if "画幅" in context or "分辨率" in context:
                    continue
            elif word.lower() not in lowered:
                continue
            problems.append(f"③ 含违禁废话词「{word}」，改用物理材质词描述质感")
        prev_line = line

    # ④ 裸英文运镜词（不区分大小写；英文运镜词必须中译）
    # 边界用 ASCII 字母数字界定（不用 \b——Python \w 含 CJK，中英无空格混排时
    # 汉字与英文之间没有 word boundary，会漏检「用zoom推近」这类最常见形态）
    bare_hits: List[str] = []
    for word in BARE_ENGLISH_CAMERA_WORDS:
        if re.search(rf"(?<![A-Za-z0-9]){word}(?![A-Za-z0-9])", lowered):
            bare_hits.append(word)
    for phrase in BARE_ENGLISH_CAMERA_PHRASES:
        if re.search(rf"(?<![A-Za-z0-9]){phrase}(?![A-Za-z0-9])", lowered):
            bare_hits.append(phrase)
    if bare_hits:
        problems.append(
            f"④ 裸英文运镜词未中译：{'、'.join(bare_hits)}"
            "（改用 shared/camera-dictionary.md 的中文运镜名）"
        )

    # ⑤ refs 数量 ≤9
    if len(refs) > MAX_REFS:
        problems.append(f"⑤ 素材映射 refs 超过 {MAX_REFS} 个（当前 {len(refs)}）")

    # ⑥ 重复块：【】节标题重复、或 ≥10 字整行重复（规格块拼装手误）。
    #    镜头块内的逐镜重复是设计不是手误：本镜限制/入点与动作/入画物/镜头头 行豁免
    exempt_prefixes = ("本镜限制", "入点与动作", "入画物", "鬼物入画", "镜头", "**镜头")
    seen: dict = {}
    for line in prompt.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(exempt_prefixes):
            continue
        is_header = stripped.startswith("【") and stripped.endswith("】")
        if (is_header and len(stripped) >= 3) or len(stripped) >= 10:
            if stripped in seen:
                if seen[stripped] == 1:  # 同块只报一次
                    problems.append(f"⑥ 重复块「{stripped[:20]}」出现两次——规格块拼装去重")
                    seen[stripped] = 2
            else:
                seen[stripped] = 1

    # ⑦ 时间轴对时（--duration 提供时启用）：时间覆盖总长 = 末镜终点 − 首镜起点。
    #    两种时间轴（「0–3 秒」式 / 「mm:ss—mm:ss」式）各自取覆盖区间，全篇应统一一种轴。
    if duration is not None:
        ranges: List[tuple] = []
        for m in re.finditer(r"(\d+(?:\.\d+)?)[–—-](\d+(?:\.\d+)?)\s*秒", prompt):
            ranges.append((float(m.group(1)), float(m.group(2))))
        for m in re.finditer(
            r"(\d{1,2}):(\d{2}(?:\.\d+)?)[–—-](\d{1,2}):(\d{2}(?:\.\d+)?)", prompt
        ):
            to_sec = lambda mm, ss: int(mm) * 60 + float(ss)  # noqa: E731
            ranges.append((to_sec(m.group(1), m.group(2)), to_sec(m.group(3), m.group(4))))
        if ranges:
            total = max(end for _, end in ranges) - min(start for start, _ in ranges)
            if abs(total - duration) > 0.5:
                problems.append(
                    f"⑦ 时间轴不对时：分镜时间覆盖 {total:.1f}s ≠ 生成时长 {duration:.1f}s"
                    "——超出内容会被模型压缩/砍掉（成片实测），调镜头秒数或生成时长对齐"
                )

    return problems


def main(argv: List[str]) -> int:
    args = argv[1:]
    mode = "video"
    duration: "float | None" = None
    while args and args[0] in ("--mode", "--duration"):
        if args[0] == "--mode":
            if len(args) < 2:
                print("用法: python3 tools/prompt_selfcheck.py [--mode image|video] [--duration 秒] <prompt_file> [ref ...]", file=sys.stderr)
                return 2
            mode = args[1]
            args = args[2:]
        else:
            if len(args) < 2:
                print("用法: python3 tools/prompt_selfcheck.py [--mode image|video] [--duration 秒] <prompt_file> [ref ...]", file=sys.stderr)
                return 2
            try:
                duration = float(args[1])
            except ValueError:
                print("--duration 需要数值（秒）", file=sys.stderr)
                return 2
            args = args[2:]
    if not args:
        print("用法: python3 tools/prompt_selfcheck.py [--mode image|video] [--duration 秒] <prompt_file> [ref ...]", file=sys.stderr)
        return 2
    prompt = Path(args[0]).read_text(encoding="utf-8").strip()
    try:
        problems = check(prompt, args[1:], mode=mode, duration=duration)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    for problem in problems:
        print(problem)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
