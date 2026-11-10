# 风格索引（选风格 → 取风格段 → 沉淀回写）

> 风格知识已按「一种风格一个 skill」深化（2026-10-27）。本文件是**选择器与沉淀路由**，不再存风格正文。

## 一、风格 skill 清单（一部剧锁 1 种，全剧不换）

| 风格 skill | 风格定位 | 适用题材 |
|-----------|---------|---------|
| `skills/style-cg-refined` | **半写实精致 CG 渲染（本套件主风格，2026-10-27 由 3D 卡通升级）**：设计可风格化、渲染必须写实——PBR 材质/自然光比/胶片颗粒/电影运镜 | 都市、科幻、动作、剧情 |
| `skills/style-anime` | 日漫 / 二次元 | 校园、恋爱、热血 |
| `skills/style-pixar` | 皮克斯质感 | 合家欢、温情、萌系 |
| `skills/style-cyberpunk` | 赛博朋克 | 科幻、悬疑、未来都市 |
| `skills/style-photoreal` | 写实摄影 | 纪实、年代、严肃题材（即梦链路需转 cel 防拦截，见 backends.md） |

## 二、取词规则

1. **风格段**只从所选风格 skill 的 `skills/style-<名>/references/style-profile.md` 取（风格锁模板/高效组合），全剧一字不差复用
2. 画质词/负面段按 `shared/backends.md` 分平台方言（禁统一挂 8k/RAW）
3. cel 系（3d-cel / anime / pixar）**禁止混入写实摄影词**（85mm/DSLR/photorealistic/skin pores）
4. 组装规则见 `shared/prompt-formula.md` §四；光影段见 `shared/lighting-system.md`

## 三、沉淀路由（出图前置调研的落点）

- 调研/实战发现**回写对应风格 skill 的 `style-profile.md`**（翻车点与对策一节优先）
- 新风格接入：按风格 skill 结构新建 `skills/style-<name>/`（SKILL.md 四标题契约 + style-profile.md 七节），在本表加一行
- 跨风格通用发现（公式/一致性/通道）回写 `shared/prompt-formula.md` 或 `shared/backends.md`，不进单一风格

## 风格索引扩充（2026-10-30）
| 风格 | skill | 用途 |
|------|-------|------|
| 漫剧/动漫动画 | style-comic | 漫画分镜感/速度线/网点 |
| 西方玄幻 | style-fantasy | 中世纪史诗/油画质感 |
| 无限流 | style-infinite-flow | 多元宇宙/系统UI/维度裂缝 |
| 朋克家族 | style-cyberpunk | 赛博/蒸汽/柴油三系 |
| 新中式国风·三渲二 | style-3d-anime 变体 | 国风/新中式题材角色设定与资产（references/new-chinese-3d-anime-spec.md） |
