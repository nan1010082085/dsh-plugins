# 视觉元数据与 LoRA 注册表（visual-metadata，2026-10-30 用户方案）

> 核心思想：把 LoRA/触发词/权重当「视觉元数据」**提前注入剧本→分镜的结构化输出**，不等最后人工拼提示词。
> 注册表 `tools/lora_registry.json`（四类）＋编译器 `tools/prompt_compiler.py` 自动拼出图/出视频指令。

## 四类 LoRA 精准控制策略

| 类型 | 绑定层级 | 权重策略 | 技巧 |
|------|---------|---------|------|
| character 角色 | Shot 级（每镜强制注入） | 0.75–0.9（过高易畸变） | 固定 Seed＋ControlNet(OpenPose) 锁动作 |
| style 风格 | Scene 级/全局（整集不变） | 0.5–0.7（避免覆盖底模） | 放 Prompt 最前面保画风统治力 |
| detail 细节 | 全局补丁（默认加载） | 0.6–0.8 | 手部/眼神光常驻弥补底模缺陷 |
| concept 概念 | 按需动态（特定镜） | 0.6–0.8 | 只在道具/场景出现时注入，禁污染他镜 |

## 进阶三狠招

1. **触发词隔离（防串脸）**：双角色镜不堆权重——用分区 `(charA_trigger:1.2), (charB_trigger:1.2)` 或 ComfyUI ConditioningSetMask 分区控制。
2. **权重动态衰减**：特写：角色 LoRA ↗0.9–1.0、细节 ↗；全景：角色 ↘0.6–0.7、概念 ↗。
3. **负面 LoRA**：防畸形手等 Negative LoRA 编译时自动追加 Negative Prompt（`<lora:negative_hand_fix:1.0>`、embedding:EasyNegative）。

## 后端方言

- **SD/ComfyUI**：编译出 `<lora:path:weight>` 标签＋trigger_words＋negative_prompt。
- **即梦/Seedance（无 LoRA）**：trigger_words 降级为「识别锚词」织入职责行与叙事；ref_role→`--ref` 参考图绑定（与提示词纯净律④职责分工表同一通道）。

## 分镜结构化输出要求

分镜镜块的素材映射条目必须携带视觉元数据引用（lora id+权重档）；出片时由 prompt_compiler 按后端编译——**创作层写结构，传输层零手工拼接**。
