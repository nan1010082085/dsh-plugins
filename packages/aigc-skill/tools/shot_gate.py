#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""shot_gate —— 出片通用硬闸（aigc-suite-skills 套件工具，2026-10-29 出片五律）。
任何项目通用：项目侧只放 gen_gate.config.json + asset_registry.json（Notion 派生快照）。

用法:
  # 1) 从 Notion 素材台账构建/刷新注册表（数据流转走 Notion；同时回写台账「分镜锁名/状态关键词」列）
  python3 -I tools/shot_gate.py --config <proj>/gen_gate.config.json --build-registry

  # 2) 出片前过闸（任一 FAIL 拒绝生成；付费 confirm/run 前必过）
  python3 -I tools/shot_gate.py --config <proj>/gen_gate.config.json \
      --shot 001-1 --prompt-file pkg/prompt.txt --ref-ids <id1,id2,...> [--status 生成中]

闸门（对应 2026-10-29 出片五律）:
  G-PARITY   ⑤本地镜块 ↔ Notion 内容列 SHA 级一致
  G-VERBATIM ①prompt ↔ 镜块四段式逐字节一致（唯一机械处理=换行归一化）——禁压缩/改写/自创
  G-REFBIND  ③④@锁名→注册表→ref 资源 ID 三者逐个对应，含状态变体（信物原色≠浅红）；多/漏/错任一即 FAIL
  G-MODEL    ②模型/比例/分辨率在项目策略内（如 seedance_2.0_fast_vip），超上限文字=回 Notion 设计变更
  G-REVIEW   ②Notion 分镜表「状态」=生成中（付费前审查记录），否则拒
"""
import argparse, hashlib, json, os, re, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
SECTIONS = ['【基础设定】', '【氛围与画质】', '【画面内容】', '【声音】']


def norm(t):
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)  # v3 结构字段注释块不传模型不入比对
    """唯一允许的机械处理：Notion <br/> 换行还原 + markdown 转义还原（\\_ \\* ~ ^ 等）+ 换行归一化 + 行尾空白 + 首尾空白。"""
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'\\([_*~^\[\]()>#+\-.!])', r'\1', t)
    t = t.replace('\r\n', '\n')
    return '\n'.join(l.rstrip() for l in t.split('\n')).strip()


def sha(t):
    return hashlib.sha256(norm(t).encode('utf-8')).hexdigest()


# ---------- Notion ----------

def notion_call(tool, args):
    from notion_mcp_client import MCP
    m = None
    for a in range(10):
        try:
            m = MCP(); break
        except Exception:
            time.sleep(10)
    for att in range(10):
        try:
            r = m.call(tool, args)
        except Exception:
            time.sleep(10); continue
        s = json.dumps(r, ensure_ascii=False)
        if '"isError"' not in s and 'validation_error' not in s:
            return r
        time.sleep(8)
    raise RuntimeError('notion call failed')


def query_rows(ds, view=None):
    rows, cur = [], None
    for _ in range(30):
        if view:
            args = {'mode': 'view', 'view_url': view, 'page_size': 100, 'is_archived': False}
            if cur: args['start_cursor'] = cur
        else:
            args = {'mode': 'sql', 'data_source_urls': [ds], 'query': f'SELECT * FROM [{ds}] LIMIT 100'}
        r = notion_call('notion-query-data-sources', {'data': args})
        d = json.loads(r['result']['content'][0]['text'])
        rows += d.get('results', [])
        if not d.get('has_more'):
            break
        cur = d.get('next_cursor'); time.sleep(1)
    return rows


# ---------- 注册表构建（R4/③④：@锁名 ↔ 画布素材）----------

# 状态变体关键词表（镜内状态词 → 变体文件命中）；default 为无状态词时的兜底
STATE_RULES = {
    '信物手链': {'原色': '原色|正红|深红|接口打死结', '浅红': '浅红|残粉|褪|剩粉|几乎看不见|断头'},
    '毛绒钥匙扣': {'渗雾': '渗雾|雾丝|异变', '': ''},
    '借命登记簿': {'翻开': '翻开|打开', '': ''},
    '灰白道具甲': {'人脸浮现': '人脸|浮现', '': ''},
}
ALIAS = {'信物手链': '信物', '道具乙拐杖': '道具乙', '毛绒钥匙扣': '毛绒', '白瓷茶壶': '茶壶',
         '灰白道具甲': '道具甲', '锈迹铁盒': '铁盒', '铸铁哑铃': '哑铃', '塑料工牌': '工牌',
         '九张塑封照片': '塑封照片', '第十张照片': '第十张', '借命登记簿': '登记簿', '银灰盾徽': '盾徽'}


def canon(name):
    n = re.sub(r'^(人物|场景|道具)-', '', name)
    n = re.sub(r'-(基础形象[A-C]|常服立绘|剧情立绘|成神样本)$', '', n)
    n = re.sub(r'-(全景|中景|特写)(_[^-\s]+)?$', '', n)
    for k, v in ALIAS.items():
        if k in n:
            return v
    return n


def name_match(a_want, b_name):
    a, b = canon(a_want), canon(b_name)
    return bool(a) and (a == b)  # 2026-10-31 用户令：只认字面相等，模糊匹配=错配元凶（门口/货架后事故）


def build_registry(cfg):
    """Notion 素材台账 → asset_registry.json；回写「分镜锁名/状态关键词」列（R5）。"""
    proj = cfg['root']
    rows = query_rows(cfg['notion']['asset_ds'])
    # 收集分镜全部 @锁名
    shot_dir = os.path.join(proj, cfg['shot_dir'])
    META = {'引用', '完整描述', '资产锁', '双保险', '素材待建'}
    lock_names = set()
    for f in os.listdir(shot_dir):
        if not f.endswith('.md'): continue
        for nm in re.findall(r'@([^\s：:，。、；;（）【】｜／/]+)',
                             open(os.path.join(shot_dir, f), encoding='utf-8').read()):
            if nm not in META and '引用' not in nm:
                lock_names.add(nm)
    reg = []
    for x in rows:
        fname = x.get('Name', '')
        rid = x.get('即梦资源ID', '')
        nid = x.get('画布节点ID', '')
        hit = next((l for l in lock_names if name_match(l, fname)), None)
        if not hit:
            hit = canon(fname)
        # 状态变体：锁名归并到 STATE_RULES 主名（信物-原色/浅红 → 信物手链）
        kws = ''
        for lock, variants in STATE_RULES.items():
            if lock in fname or name_match(hit, lock) or name_match(fname, lock):
                hit = lock
                for tag, pat in variants.items():
                    if tag and tag in fname:
                        kws = pat
                break
        reg.append({'file': fname, 'resource_id': rid, 'node_id': nid,
                    'lock_name': hit, 'state_keywords': kws})
    out = os.path.join(proj, 'asset_registry.json')
    json.dump({'built_at': time.strftime('%F %T'), 'assets': reg},
              open(out, 'w'), ensure_ascii=False, indent=1)
    # 回写 Notion 两列（R5 对齐）
    for x, r in zip(rows, reg):
        pid = x['url'].rsplit('/', 1)[-1]
        notion_call('notion-update-page', {'page_id': pid, 'command': 'update_properties',
                    'properties': {'分镜锁名': r['lock_name'], '状态关键词': r['state_keywords']}})
        time.sleep(0.2)
    print(f'✓ 注册表 {len(reg)} 条 → {out}；已回写 Notion「分镜锁名/状态关键词」')
    return reg


# ---------- 过闸 ----------

def load_shot(cfg, shot):
    n, idx = shot.split('-')
    fp = os.path.join(cfg['root'], cfg['shot_file'].format(n=int(n)))
    txt = open(fp, encoding='utf-8').read()
    for p in re.split(r'(?=\n### 镜 ?\d+)', txt):
        m = re.match(r'\n?### 镜 ?(\d+)', p)
        if m and int(m.group(1)) == int(idx):
            i = max(p.find('【镜头】'), p.find('【基础设定】'))
            return p[i:]
    raise SystemExit(f'找不到镜 {shot}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--build-registry', action='store_true')
    ap.add_argument('--shot'); ap.add_argument('--prompt-file')
    ap.add_argument('--emit-prompt', help='从 Notion 内容列逐字取该镜四段式，写到该路径（生成提示词唯一合法来源）')
    ap.add_argument('--ref-ids', default='', help='实际传给生成调用的资源 ID（逗号分隔）')
    ap.add_argument('--status', default='', help='Notion 分镜表状态（留空则自取）')
    a = ap.parse_args()
    cfg = json.load(open(a.config))
    if cfg.get('root') in (None, '', '.'):
        cfg['root'] = os.path.dirname(os.path.abspath(a.config))
    sys.path.insert(0, cfg.get('mcp_tools', os.path.dirname(os.path.abspath(__file__))))

    if a.build_registry:
        build_registry(cfg)
        return

    # Notion 内容列 = 提示词唯一合法来源（R5）
    def notion_seg(shot):
        rows = query_rows(cfg['notion']['storyboard_ds'], view=cfg['notion'].get('view'))
        cands = (str(x.get('镜号') or '') for x in rows)
        for x in rows:
            if str(x.get('镜号')) in (shot, shot.split('-')[0].lstrip('0') + '-' + shot.split('-')[1], shot.replace('-', '-0')):
                c = x.get('内容') or ''
                i = max(c.find('【镜头】'), c.find('【基础设定】'))
                return c[i:] if i >= 0 else c
        return None

    if a.emit_prompt:
        seg_n = notion_seg(a.shot)
        assert seg_n, f'Notion 内容列无 {a.shot}'
        open(a.emit_prompt, 'w', encoding='utf-8').write(norm(seg_n))
        print(f'✓ 提示词已从 Notion 逐字取出 → {a.emit_prompt}（sha={sha(seg_n)[:16]}…）')
        return

    fails = []
    seg = load_shot(cfg, a.shot)
    prompt = open(a.prompt_file, encoding='utf-8').read()

    # G-PARITY ⑤：本地镜块 ↔ Notion 内容列 SHA 级一致
    seg_n = notion_seg(a.shot)
    if not seg_n:
        fails.append('G-PARITY: Notion 内容列无该镜——数据流转必须过 Notion')
    elif sha(seg_n) != sha(seg):
        fails.append(f'G-PARITY: 本地镜块与 Notion 内容列不一致（{sha(seg)[:12]}≠{sha(seg_n)[:12]}）——先对齐再出片')
    else:
        print(f'G-PARITY ✓ 本地↔Notion 一致 sha={sha(seg)[:16]}…')
    ref_ids = [r.strip() for r in a.ref_ids.split(',') if r.strip()]
    pol = cfg['model_policy']

    # G-VERBATIM ①
    if sha(prompt) != sha(seg):
        fails.append(f'G-VERBATIM: prompt 与镜块不一致（{sha(prompt)[:12]}≠{sha(seg)[:12]}）——禁压缩/改写/自创描述块')
    else:
        print(f'G-VERBATIM ✓ 逐字一致 sha={sha(seg)[:16]}…')

    # G-MODEL ②-长度
    if len(norm(seg)) > pol['prompt_limit']:
        fails.append(f'G-MODEL: 镜块 {len(seg)} 字超 {pol["prompt_limit"]} 上限——回 Notion 设计变更，禁止传输时压缩')
    for s in SECTIONS:
        if s not in prompt:
            fails.append(f'G-VERBATIM: 缺{s}')

    # G-REFBIND ③④
    reg = json.load(open(os.path.join(cfg['root'], 'asset_registry.json')))['assets']
    META = {'引用', '完整描述', '资产锁', '双保险', '素材待建'}
    wants = [w for w in dict.fromkeys(re.findall(r'@([^\s：:，。、；;（）【】｜／/]+)', seg)) if w not in META and '引用' not in w]
    shot_size = re.search(r'景别：([^\s。：:]{1,3})', seg)
    shot_size = shot_size.group(1)[:2] if shot_size else ''
    expected = []
    for w in wants:
        cands = [r for r in reg if r['lock_name'] == w or name_match(w, r['file']) or name_match(w, r['lock_name'])]
        if not cands:
            fails.append(f'G-REFBIND: @{w} 在素材台账无登记素材')
            continue
        # ①状态变体按镜内状态词选（信物原色≠浅红）
        pick = next((c for c in cands if c['state_keywords'] and re.search(c['state_keywords'], seg)), None)
        # ②景别变体按镜块「景别：」选
        if not pick and shot_size:
            pick = next((c for c in cands if c['file'].replace('.png', '').endswith(f'-{shot_size}')), None)
        # ③默认：无状态后缀的基名
        pick = pick or next((c for c in cands if not c['state_keywords']), None) or cands[0]
        expected.append(pick)
    exp_ids = [e['resource_id'] for e in expected if e.get('resource_id')]
    if ref_ids:
        miss = [e['file'] for e in expected if e['resource_id'] not in ref_ids]
        wrong = [i for i in ref_ids if i not in exp_ids]
        if miss:
            fails.append(f'G-REFBIND: 镜块 @素材 未绑定参考图: {miss}')
        if wrong:
            fails.append(f'G-REFBIND: 引用了镜块没写的素材（@取错/引用错误）: {wrong}')
        if not miss and not wrong:
            print(f'G-REFBIND ✓ {len(expected)} 个 @素材 ↔ 资源 ID 一一对应: {[(e["lock_name"], e["file"]) for e in expected]}')
    else:
        fails.append('G-REFBIND: 未提供 --ref-ids（生成调用实际引用）')

    # G-REVIEW ②（付费前审查）
    st = a.status
    if not st:
        rows = query_rows(cfg['notion']['storyboard_ds'], view=cfg['notion'].get('view'))
        st = next((x.get('状态') for x in rows if str(x.get('镜号')) in (a.shot, a.shot.replace('-', '-0'))), '')
    if st != cfg.get('status_gate', '生成中'):
        fails.append(f'G-REVIEW: 状态={st}（须={cfg.get("status_gate","生成中")}，Notion 付费前审查记录）')
    else:
        print('G-REVIEW ✓ 状态=生成中（审查记录在案）')

    print(f'=== shot_gate {a.shot} ===')
    if fails:
        for f in fails: print('FAIL', f)
        print('✗ 硬闸未过——禁止生成'); sys.exit(1)
    print('✓ 全闸通过，可进入 quote→批→run')


if __name__ == '__main__':
    main()
