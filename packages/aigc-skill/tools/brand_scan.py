"""brand_scan — 广告植入闸（品牌词三层扫描）。

扫描表达三层：画面（视觉描述）、语音（台词/旁白/弹幕）、字幕。
词表：shared/brand-wordlist.txt，每行一个品牌词/短语，跳过空行。
仅用 stdlib；命中返回 [{"word": ..., "layer_guess": ...}]。

歧义通用词规则（防误伤）：短通用品牌词（词表条目同时是日常名词，见
AMBIGUOUS_GENERIC_BRANDS）只有当后面**不**紧跟通用后缀字时才命中——
「苹果汁 / 小米粥 / 百事通」是普通用法不报，裸「苹果 / 小米」照样报。
无歧义品牌（高德地图 / 星巴克…）维持子串匹配不变。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional

WORDLIST_PATH = (
    Path(__file__).resolve().parent.parent / "shared" / "brand-wordlist.txt"
)

# 短通用品牌词：词表里同时是日常名词的条目（扫 shared/brand-wordlist.txt 得出）——
# 苹果=水果、小米=杂粮、百事=百事通类口语、华为=用户点名纳入。
# 词表里另有荣耀/联想/奔驰/宝马/滴滴/旺旺等也可作普通词，但它们的普通用法是
# 裸词或语法续接（「我的荣耀」「联想到」「奔驰着」），后缀字规则救不了、且把
# 的/在/到一类虚词当后缀会放走「苹果的新品」这类真品牌句，故仍走严格子串匹配。
AMBIGUOUS_GENERIC_BRANDS = frozenset({"苹果", "小米", "百事", "华为"})

# 通用后缀字：歧义词后紧跟这些字时判为普通用法、放行（只收能组成日常复合词的
# 实语素，如苹果汁/苹果树/苹果园/苹果派/小米粥/小米饭/小米汤/百事通）。
# 刻意保持短小——宁可漏放个别普通用法，也不给真品牌开口子。
GENERIC_SUFFIX_CHARS = frozenset("汁树园粥通饭派汤")


def _load_wordlist(path: Optional[Path] = None) -> List[str]:
    target = path if path is not None else WORDLIST_PATH
    words: List[str] = []
    for line in target.read_text(encoding="utf-8").splitlines():
        word = line.strip()
        if word:
            words.append(word)
    return words


def _has_brand_use(word_lower: str, haystack: str) -> bool:
    """word 是否在文本中出现过「品牌用法」。

    无歧义词：子串出现即算；歧义通用词：逐处检查后继字符，
    只有存在一处不接通用后缀字的出现才算品牌用法（裸词/品牌搭配都报）。
    """
    if word_lower not in AMBIGUOUS_GENERIC_BRANDS:
        return word_lower in haystack
    for m in re.finditer(re.escape(word_lower), haystack):
        nxt = haystack[m.end() : m.end() + 1]
        if nxt in GENERIC_SUFFIX_CHARS:
            continue  # 苹果汁/小米粥/百事通类普通用法
        return True
    return False


def _scan_layer(
    text: str, layer_guess: str, words: List[str]
) -> List[Dict[str, str]]:
    hits: List[Dict[str, str]] = []
    haystack = text.lower()
    for word in words:
        if _has_brand_use(word.lower(), haystack):
            hits.append({"word": word, "layer_guess": layer_guess})
    return hits


def scan_text(text: str) -> List[Dict[str, str]]:
    """扫描裸文本；layer_guess 无法判定时为 "unknown"。"""
    return _scan_layer(text, "unknown", _load_wordlist())


def scan_shot(
    画面: str,
    台词旁白弹幕: str,
) -> List[Dict[str, str]]:
    """扫描一个镜头的全部表达层。

    画面 → layer_guess="画面"；台词/旁白/弹幕 → layer_guess="语音"。
    """
    words = _load_wordlist()
    hits = _scan_layer(画面, "画面", words)
    hits += _scan_layer(台词旁白弹幕, "语音", words)
    return hits
