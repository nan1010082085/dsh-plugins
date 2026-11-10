#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""trust_audit —— 分镜可信度机检（T1/T2/T3/T5 + T4 半机检）。
用法: python3 -I tools/trust_audit.py <分镜md文件>   # 或传目录批量
输出: 逐镜 A/B/C 评级 + 不可信镜清单；C 级 exit 1。
规范: skills/shot-qa/references/trust-audit.md（2026-10-29 用户令）
"""
import difflib, glob, os, re, sys

BANNED = ['同镜', '复述锚点', '以本描述为准', '完整状态照写', '表情资产按状态引用',
          '完整描述复述', '〔', '〕']
META = re.compile(r'@[^：:\s]+[:：]|表情资产|素材待建|修订定稿')
MOVE = re.compile(r'走来|走去|奔跑|跑向|冲向|奔向|前行|走近|走远|迈步|跨过|冲出|跑过|走过|退后|后退|扑向')
VEC = re.compile(r'由远及近|由近及远|从左|从右|向左|向右|朝镜头|背对镜头|迎面|纵深|画左|画右|远离|走向镜头|从深处|从画面|向镜头')


def shots_of(fp):
    txt = open(fp, encoding='utf-8').read()
    out = []
    for p in re.split(r'(?=\n### 镜 ?\d+)', txt):
        m = re.match(r'\n?### 镜 ?(\d+)', p)
        if m:
            out.append((int(m.group(1)), p))
    return out


def narrative_ratio(seg):
    body = seg
    n = re.search(r'【画面内容】\n(.*)', body, re.S)
    narr = n.group(1) if n else ''
    return (len(re.sub(r'\s', '', narr)), len(re.sub(r'\s', '', body)))


def audit_shot(seg):
    fails, notes = 0, []
    seg = re.sub(r'<!--.*?-->', '', seg, flags=re.S)  # 结构字段注释块不传模型，不计污染
    nchar, total = narrative_ratio(seg)
    ratio = nchar / total if total else 0
    if ratio < 0.25: fails += 1; notes.append(f'T1 叙事占比 {ratio:.0%}<25%')
    elif ratio < 0.35: notes.append(f'T1 叙事占比 {ratio:.0%}（B档）')
    hits = [b for b in BANNED if b in seg]
    if hits: fails += 1; notes.append(f'T2 复述依赖禁词: {hits}')
    n_meta = len(META.findall(seg))
    if n_meta >= 3: fails += 1; notes.append(f'T5 生产元注释 {n_meta} 处')
    elif n_meta: notes.append(f'T5 轻污染 {n_meta} 处（B档）')
    # T4 半机检：位移镜缺动线
    if MOVE.search(seg) and not VEC.search(seg):
        fails += 1; notes.append('T4 位移镜缺运动矢量（假动作风险）')
    if re.search(r'运镜手法：.*(推|拉)', seg) and MOVE.search(seg) and not VEC.search(seg):
        notes.append('T4 双动叠加风险')
    return fails, notes, ratio


def audit_file(fp):
    segs = shots_of(fp)
    bodies = [s for _, s in segs]
    print(f'=== {os.path.basename(fp)}（{len(segs)} 镜）===')
    c_shots = []
    for idx, seg in segs:
        fails, notes, ratio = audit_shot(seg)
        # T3 复读
        sims = [difflib.SequenceMatcher(None, seg, b).ratio() for j, b in enumerate(bodies) if j != idx - 1]
        max_sim = max(sims) if sims else 0
        if max_sim >= 0.80: fails += 1; notes.append(f'T3 与他镜相似度 {max_sim:.0%}（整段复读）')
        elif max_sim >= 0.65: notes.append(f'T3 相似度 {max_sim:.0%}（B档）')
        hard = any(n.startswith(('T2', 'T4')) for n in notes)  # T2/T4 单维即 C（规范）
        grade = 'C' if (fails >= 2 or hard) else ('B' if fails or notes else 'A')
        if grade == 'C': c_shots.append(idx)
        flag = {'A': '✓', 'B': '△', 'C': '✗'}[grade]
        print(f'  镜{idx:>2} {flag} {grade} 叙事{ratio:.0%} ' + '；'.join(notes))
    if c_shots:
        print(f'✗ C 级镜: {c_shots} —— 强制重写')
    return c_shots


def main():
    args = sys.argv[1:]
    files = []
    for a in args:
        files += sorted(glob.glob(a)) if os.path.isdir(a) else [a]
    any_c = False
    for fp in files:
        if audit_file(fp): any_c = True
    sys.exit(1 if any_c else 0)


if __name__ == '__main__':
    main()
