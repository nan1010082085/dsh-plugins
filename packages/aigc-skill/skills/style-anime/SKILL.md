---
name: style-anime
description: 日漫/二次元风格段出图/出片专用 skill——为剧本/分镜/人物/场景生图组装日系动漫风格锁模板与高效组合词组，按即梦/SD/Midjourney 等后端分流画质词与负面词（Booru 质量词只在动漫底模生效），防写实词混入漂向写实/半写实。
---

# style-anime（日漫 / 二次元 · 风格段）

剧目风格锁为「日漫/二次元」时的风格段出口。风格段 = 风格锁句 + 高效组合词组 + 后端画质/负面词尾巴，供五段式组装直接取用。

## 何时使用

- 剧目风格锁为「日漫/二次元」时，所有出图/出片提示词取本风格段
- 用户问：日漫 / 二次元 / 日系动漫 / 吉卜力风提示词怎么写
- 新剧立项定风格、或人物三视图/场景空镜/分镜成片需要统一风格段

## 流程

1. **确认风格锁**：一部剧只锁 1 种风格，全剧不换（与 `shared/director-styles.md` 全剧基调对齐）
2. **取风格段**：从 `references/style-profile.md` 取「风格锁模板」（中/英各一版）+「高效组合」词组，组装风格段；吉卜力变体按 profile 追加词组
3. **按后端调方言**：画质词/负面词按 `shared/backends.md` 与 style-profile「负面词与画质词策略」分流——**质量词位置分底模**：Animagine XL 4.0 官方要求质量词放**句尾**（前置会让 artist/风格词失效）、NAI 官方质量词开关也是句尾追加、NAI V3 词序前置强、Pony score 梯子放句首；其余平台删质量词【官方·CagliostroLab / NAI docs】（2026-10-31 校订：原写「masterpiece 族放最前」，依 batch5 §1.4 改为分底模位置）
4. **总装**：风格段嵌入五段式组装（`shared/prompt-formula.md` §四），与人物锚点段、场景锚点段拼接
5. **翻车点自检**：对照 style-profile「翻车点与对策」逐条过，重点查手部、画风漂移、写实词混入

## 硬闸与自检

- **禁写实词混入 cel 系**：photorealistic / 写实皮肤质感 / 85mm / DSLR 不进风格段——混入即漂向写实/半写实，易出半写实不协调感【社区实证·Reddit PSA + Civitai】（2026-10-31 校订：原写「半写实恐怖谷」，依 batch5 §3 降级为「易出半写实不协调感」——恐怖谷是可能后果而非必然）（研究 §7 修正 1）
- **禁知名角色名/受保护角色**：风格描述≠复制角色，禁写知名动漫角色/IP 名
- **画质词按后端分流**：禁统一挂 8k/RAW（8k/4k 只偏置训练 caption、不改分辨率）；Booru 质量词仅 Booru 训练族（NAI/Animagine/Pony）有强信号且 ≤3 个（>3–4 个稀释注意力、可能属性泄漏）【社区实证·Promgrammer】。**masterpiece 降级**：NAI 现行体系里是 Aesthetic Tag、仅 V4.5+ 生效，逐词对照 very aesthetic 最强 / amazing quality 显著 / best quality 几乎无效【官方·NAI docs】【社区实证·note.com】（2026-10-31 校订：原写「masterpiece/best_quality 强有效」依 batch5 §1.2 降级）。Pony 用 `score_9, score_8_up, score_7_up` 梯子放句首，V7 弱化 score 词改 `score_8`/`score_7_up`，`source_/rating_` 仅训练过的模型生效【社区实证·artificialguy / Civitai】；SDXL base/Flux 弱或反向（masterpiece 拉向绘画感）、MJ 完全忽略内联质量词（用 `--style raw`/`--stylize`/`--quality`）——Flux/GPT/即梦/MJ 全删【社区实证·Promgrammer】（研究 §3）
- **风格污染警告**：写实照片感、西方卡通、厚涂油画等互斥画风入负面封堵；一剧一风格不混搭
- **出图前置调研**：新疑问先走 `shared/pre-gen-research.md` 四步，结论回写 style-profile.md

## 产出与格式

- **产出 = 风格段文本**（中文版 + 英文版，可直接嵌入五段式组装的风格位）
- 风格段固定三件：风格锁句（整段复制）+ 高效组合词组（按需摘取）+ 后端画质/负面词尾巴
- **沉淀规则**：调研/实战新发现回写 `references/style-profile.md`，标注来源；未查证处标【推测】
