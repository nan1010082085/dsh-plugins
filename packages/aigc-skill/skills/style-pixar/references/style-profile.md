# style-pixar 风格档案（皮克斯质感）

> 依据：`docs/superpowers/reports/2026-10-27-prompt-optimization-research.md` §4-3、§3 + `shared/style-library.md` §三。未查证处标【推测】。

## 风格定位

皮克斯式 3D 动画电影质感：四件套 = 圆润比例 + 夸张表情 + SSS 皮肤材质 + 电影级布光（研究 §4-3）。

## 高效组合（核心词组，中英对照）

| 中文 | English |
|------|---------|
| 皮克斯式 3D 动画电影感 | 3D Pixar-style animated feature look |
| 头部略大、脸颊柔和、剪影可读 | slightly large head, soft cheeks, readable silhouette |
| 大而有神的眼睛、虹膜高光清晰 | big expressive eyes, crisp iris highlights |
| 柔和次表面散射皮肤 | soft subsurface scattering (SSS) skin |
| 光滑风格化发束 | smooth stylized hair clumps |
| 电影三点布光、柔主光+暖轮廓光 | cinematic three-point lighting, soft key + warm rim |
| 柔和环境光遮蔽 | gentle ambient occlusion |
| 动画电影剧照 | animated film still |
| 具体表情词（比只写 cute 有效） | curious / joyful / mischievous expression |

> **词效标注（2026-10-31，batch5 §④）**：「次表面散射（SSS）」= **跨模型借用**——SD 系写实侧有效【社区实证·Reddit r/StableDiffusion】、与 3D 渲染语料强关联【社区实证】、Flux 弱需 SSS LoRA【社区实证·旁证】，但 **Seedream/即梦/MJ、SDXL 动漫侧无任何 A/B 实证（空白）**【查不到】。

## 风格锁模板（整段复制）

**中文版**：
皮克斯式 3D 动画电影质感：头部略大、脸颊柔和、剪影清晰可读；大而有神的眼睛、虹膜高光清晰；柔和次表面散射皮肤、光滑风格化发束；电影三点布光、柔和主光 + 暖色轮廓光、柔和环境光遮蔽；动画电影剧照质感，形体圆润略夸张，表情具体生动（温暖/好奇/俏皮任选其一写死）。

**英文版**：
3D Pixar-style animated feature look: slightly large head, soft cheeks, readable silhouette; big expressive eyes, crisp iris highlights; soft subsurface scattering skin, smooth stylized hair clumps; cinematic three-point lighting, soft key + warm rim, gentle ambient occlusion; animated film still, rounded slightly exaggerated proportions, one specific vivid expression (warm / curious / playful).

## 光影/运镜偏好

电影三点布光（柔主光 + 暖轮廓光）为基调，按 `shared/lighting-system.md` 三层拼装；景别/机位词用 `shared/camera-dictionary.md`，生图只写固定景别不写运镜。

## 负面词与画质词策略

- **画质词全平台删**（研究 §3）：masterpiece 在 SDXL 把图拉向「画廊绘画」（写实/动画目标都减分）、Flux 上近乎无效、Midjourney 直接忽略内联质量词；8k/RAW 不提升分辨率只带噪【社区实证·Promgrammer】。换成 SSS/材质/布光词（光泽动画渲染、柔和暖光、类黏土软质感）。
- **禁写实词**：photorealistic / skin pores / 85mm / DSLR 冲掉动画感（研究 §7 修正 1）。
- **负面词通道**（研究 §3）：SD/SDXL 真负面框 5–15 词（写实照片、恐怖谷、僵硬表情、塑料假人、皮肤蜡质感、眼神呆滞、畸形手指、多余肢体、文字、水印、假 Logo）；Midjourney `--no` 3–5 词（realistic photo, plastic skin, extra fingers, text）——**MJ `--no` 官方定性=nudge 非绝对过滤**，正文写 "no X" 无效、必须用 `--no`、逗号分隔置尾、点名罕见反引入【官方·MJ docs（403，镜像交叉）】；Flux/GPT-Image/Nano Banana/即梦无负面通道（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）（2026-10-31 校订：原【即梦无负面框·推测】API 层升级官方实证）→ 正向改写「表情温暖清晰、眼神有神、皮肤质感精致、画面干净」。

## 翻车点与对策

| 翻车点（研究 §4-3） | 对策 |
|--------|------|
| 只写 `Pixar style, cute` → 通用贴纸脸 | 四件套写全 + 明确表情词（curious/joyful），不写只 cute |
| 一次改表情+服装+场景 → 脸一起漂 | 坚持一图一变量：先肖像锁脸，再扩场景 |
| 写实关键词冲掉动画感 | 写实词黑名单扫描；负面封堵写实照片 |
| 写实电商产品图套皮克斯风 → 产品被卡通化 | 产品图不走本风格；要产品质感换写实摄影 skill |
| 版权：风格描述≠复制受保护角色 | 禁写知名角色名/IP 名，只描述风格特征 |
| 塑料假人/恐怖谷（无出处） | 眼神写「有神/清晰可读」、表情写具体情绪；逐图查皮肤/眼睛/发量三件套 |
| MJ 快捷通道 `--sref 3687830488 --v 7` 开 3D 卡通风格门【推测：风格码效果随版本波动】 | 可试作起点，失败回退风格锁模板长描述 |

## 双语示例（完整场景提示词）

**中文版**：
皮克斯式 3D 动画电影质感，动画电影剧照。圆润略夸张的中国小男孩【角色锚点：黑色锅盖头、大而有神的棕眼、红色双肩包】表情好奇，踮脚够厨房餐桌上的饼干罐；柔和次表面散射皮肤、光滑发束；清晨柔光从画面右侧窗户进入，柔主光+暖轮廓光，柔和环境光遮蔽。中景，膝盖以上，三分法构图。道具不遮挡人物、比例不压过主体。画面无文字无水印。

**English version**：
3D Pixar-style animated feature look, animated film still. A rounded, slightly exaggerated Chinese boy (anchors: black bowl-cut hair, big expressive brown eyes, red backpack) with a curious expression, tiptoeing to reach a cookie jar on the kitchen table; soft SSS skin, smooth stylized hair clumps; soft morning light from the right window, soft key + warm rim, gentle ambient occlusion. Medium shot above the knees, rule of thirds. Props must not cover or out-scale the subject. No text, no watermark.
