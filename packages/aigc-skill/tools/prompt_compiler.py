#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
【2026-10-31 审计标注】本编译器未接入生产出片链（历史出片均未使用），且依赖未训练 lora。SD 后端启用前不可依赖。

prompt_compiler —— 结构化分镜 → 出图/出视频指令编译器（2026-10-30 用户方案）。
用法: python3 -I tools/prompt_compiler.py shot.yaml [--backend dreamina|sd]
输入 shot_data（YAML/JSON）: {shot_id, angle, action, prompt_extra, negative_prompt, loras:[{type,id,weight}]}
输出: 即梦方言=参考图职责行+触发词锚+画面描述；SD方言=<lora:>+trigger_words+positive/negative
"""
import json, sys, os
REG = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lora_registry.json')))

def compile_prompt(shot, backend='dreamina'):
    pos, lora_tags, ref_lines = [], [], []
    for l in shot.get('loras', []):
        info = REG.get(l.get('type', ''), {}).get(l['id'])
        if not info:
            raise SystemExit(f"lora_registry 无 {l.get('type')}/{l['id']}")
        w = l.get('weight', info.get('default_weight', 0.8))
        if backend == 'sd':
            lora_tags.append(f"<lora:{info['path']}:{w}>")
            pos.append(info['trigger_words'])
        else:  # dreamina：触发词即识别锚，ref_role 绑定参考图
            pos.append(info['trigger_words'])
            if info.get('ref_role'):
                ref_lines.append(f"参考图：{info['ref_role']}")
    if backend == 'sd':
        positive = ", ".join(lora_tags + pos + [shot.get('prompt_extra', '')])
    else:
        positive = "\n".join(ref_lines) + "\n" + ", ".join(pos) + "。" + shot.get('prompt_extra', '')
    return positive, shot.get('negative_prompt', 'lowres, bad anatomy, text, watermark')

if __name__ == '__main__':
    data = json.load(open(sys.argv[1]))
    backend = 'sd' if '--backend sd' in ' '.join(sys.argv) else 'dreamina'
    pos, neg = compile_prompt(data, backend)
    print('POSITIVE:\n' + pos + '\n\nNEGATIVE:\n' + neg)
