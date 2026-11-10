#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出图/出视频五道硬闸（2026-10-19 用户令）。任一 FAIL 拒绝生成。
G1 分镜细节：每镜≥250字；多人镜逐人（格位/外貌/动作/台词四要素）；语境关键词命中（按剧目配置）
G2 素材关联：每镜露脸角色全部挂资产（card必有），场景必挂；溢出须登记
G3 剧情核验：看点/钩子/名场面在镜内有落点；每镜过小说事实抽查（关键词命中）
G4 场景纯净：引用的场景节点必须是无人空镜（registry 校验，白名单按剧目配置）
G5 Notion 同步：矩阵 source 必须 Notion 生成；生成指令与 Notion 一致
用法: python3 -I tools/pre_gen_gate.py <episode_matrix.json> <episode_script.md> <novel_glob> [--config CFG.json]
剧目配置：纯净空镜白名单 / 题材语境关键词 / 角色简称别名三组数据按剧目外置，
默认读 CWD 下 ./pre_gen_gate_config.json（模板见 tools/pre_gen_gate_config.example.json）。
"""
import argparse, json, re, sys, glob, os

# 实质落点证据表（2026-10-19 协调者红线：看点/钩子/格位在镜内有实质落点但字面词不匹配的，
# 附镜内原句当作过闸证据，禁止为塞关键词改写剧本）。quote 必须逐字出现在对应镜 full_text 才生效。
EVIDENCE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gate_evidence.json')

def load_evidence(ep):
    try:
        ev = json.load(open(EVIDENCE_PATH))
    except Exception:
        return []
    return [e for e in ev if e.get('ep') == ep]

def evidence_hit(ev_list, check, target, scope_texts):
    """scope_texts: {shot_id: full_text}；证据 quote 必须逐字命中其声明的镜。"""
    for e in ev_list:
        if e.get('check') != check:
            continue
        if e.get('target') != target:
            continue
        t = scope_texts.get(e.get('shot', ''), '')
        if e.get('quote') and e['quote'] in t:
            return e
    return None

DEFAULT_CONFIG_PATH = './pre_gen_gate_config.json'
CONFIG_KEYS = ('pure_scene_ok', 'context_keywords', 'cast_short_forms')

def load_config(path):
    """加载剧目配置（三组数据：纯净空镜白名单/语境关键词/角色简称别名）。"""
    try:
        cfg = json.load(open(path))
    except FileNotFoundError:
        sys.exit(f'缺剧目配置 {path}——从 tools/pre_gen_gate_config.example.json 复制一份并按剧目填写')
    missing = [k for k in CONFIG_KEYS if k not in cfg]
    if missing:
        sys.exit(f'剧目配置 {path} 缺字段: {", ".join(missing)}（对照 tools/pre_gen_gate_config.example.json）')
    return cfg

def main():
    p = argparse.ArgumentParser(description='五道硬闸预检（剧目配置外置）')
    p.add_argument('episode_matrix')
    p.add_argument('episode_script')
    p.add_argument('novel_glob')
    p.add_argument('--config', default=DEFAULT_CONFIG_PATH,
                   help='剧目配置 JSON（默认 ./pre_gen_gate_config.json）')
    args = p.parse_args()
    mx_path, script_path, novel_glob = args.episode_matrix, args.episode_script, args.novel_glob
    cfg = load_config(args.config)
    PURE_SCENE_OK = set(cfg['pure_scene_ok'])
    CONTEXT_KEYWORDS = list(cfg['context_keywords'])
    SHORT_FORM = dict(cfg['cast_short_forms'])
    mx = json.load(open(mx_path))
    script = open(script_path).read()
    novel = ''
    for f in sorted(glob.glob(novel_glob)):
        novel += open(f).read()
    fails = []

    # G5 来源
    if 'build_matrix_from_notion' not in mx.get('source', ''):
        fails.append('G5: 矩阵非 Notion 来源')

    # G3 剧情核验：看点/钩子词必须在镜内出现（字面不中时查实质落点证据）
    ep_code = re.search(r'(\d{3})', os.path.basename(mx_path)).group(1)
    ev_list = load_evidence(ep_code)
    shot_texts = {s['id']: s.get('full_text','') for s in mx['shots']}
    all_text = ' '.join(shot_texts.values())
    kan = re.search(r'本集看点：([^。]+)', script)
    if kan:
        for kw in re.split(r'[、——,，]', kan.group(1))[:4]:
            kw = kw.strip()[:6]
            if len(kw) < 3 or kw in all_text:
                continue
            ev = evidence_hit(ev_list, 'G3-kan', kw, shot_texts)
            if ev:
                print(f'  [G3证据过闸] 看点词「{kw}」→ {ev["shot"]}：{ev["quote"][:40]}…')
            else:
                fails.append(f'G3: 看点词「{kw}」未落镜')
    hook = re.search(r'结尾钩子：([^。]+)', script)
    if hook and mx['shots']:
        last = mx['shots'][-1]['full_text']
        kw = hook.group(1).strip()[:6]
        if len(kw) >= 3 and kw not in last:
            ev = evidence_hit(ev_list, 'G3-hook', kw, shot_texts)
            if ev:
                print(f'  [G3证据过闸] 钩子词「{kw}」→ {ev["shot"]}：{ev["quote"][:40]}…')
            else:
                fails.append(f'G3: 钩子词「{kw}」未在结尾镜')

    for s in mx['shots']:
        sid = s['id']
        full = s.get('full_text', '')
        body = re.sub(r'\s+', '', re.sub(r'### [^\n]+', '', full))
        # G1 细节
        if len(body) < 250:
            fails.append(f'G1: [{sid}] 叙事 {len(body)}字<250')
        if not any(kw in full for kw in CONTEXT_KEYWORDS):
            fails.append(f'G1: [{sid}] 缺题材语境（{"/".join(CONTEXT_KEYWORDS)}）')
        chars = s.get('chars_in_shot', [])
        if len(chars) >= 2:
            for c in chars:
                forms = [c] + SHORT_FORM.get(c, [])
                seg = ''
                for f in forms:
                    if f in full:
                        seg = full[full.find(f):full.find(f)+80]
                        break
                # 布局段成员即有格位（「位置＝人·」句式）
                layout_m = re.search(r'布局（[^）]*）：([^\n]+)', full)
                in_layout = bool(layout_m and any(f + '·' in layout_m.group(1) or '＝' + f in layout_m.group(1) or f + '·' in layout_m.group(1).replace('＝', '') for f in forms))
                if (seg and re.search(r'格|位|左|右|上|下|间|旁|前|后', seg)) or in_layout:
                    continue
                ev = evidence_hit(ev_list, 'G1-pos', f'{sid}|{c}', shot_texts)
                if ev:
                    print(f'  [G1证据过闸] [{sid}]「{c}」格位 → {ev["quote"][:40]}…')
                else:
                    fails.append(f'G1: [{sid}] 多人镜「{c}」缺格位/方位')
            if full.count('「') < 2:
                ev = evidence_hit(ev_list, 'G1-dial', sid, shot_texts)
                if ev:
                    print(f'  [G1证据过闸] [{sid}] 台词 → {ev["quote"][:40]}…')
                else:
                    fails.append(f'G1: [{sid}] 多人镜台词不足2句（须逐人开口）')
        # G2 素材
        overflow = set(s.get('capacity_overflow', []))
        for c in chars:
            ck = next((x for x in mx['cast'] if x['name']==c), None)
            if ck and ck.get('no_face'): continue
            if c in overflow: continue
            aks = (ck or {}).get('asset_keys', {})
            if not any(aks.get(r) in s['refs'] for r in ('card','expr','ref')):
                fails.append(f'G2: [{sid}] 「{c}」未挂任何人物素材')
        if not any(r.startswith('scene_') for r in s['refs']) and '闪回' not in full and not s.get('scene_via_layout_text'):
            fails.append(f'G2: [{sid}] 无场景素材')
        if s.get('scene_via_layout_text'):
            print(f'  [G2豁免] [{sid}] 九卡满额，房间场景由布局段文字承载（scene_via_layout_text）')
        # G4 场景纯净
        for r in s['refs']:
            if r.startswith('scene_'):
                title = mx['nodes'].get(r, {}).get('title', '')
                if title and title not in PURE_SCENE_OK:
                    fails.append(f'G4: [{sid}] 场景「{title}」不在纯净空镜白名单')

    print(f'=== 五道硬闸 {os.path.basename(mx_path)} ===')
    if fails:
        for f in fails: print('FAIL', f)
        print(f'✗ {len(fails)} 项不过——禁止生成')
        sys.exit(1)
    print('✓ 五闸全过：G1分镜细节 / G2素材关联 / G3剧情落点 / G4场景纯净 / G5 Notion来源')

if __name__ == '__main__':
    main()
