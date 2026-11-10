# style-cyberpunk 风格档案（赛博朋克）

> 依据：`docs/superpowers/reports/2026-10-27-prompt-optimization-research.md` §4-4、§3、§2 + `shared/style-library.md` 通用纪律。未查证处标【推测】。

## 风格定位

赛博朋克「high-tech low-life」：霓虹巨都、雨夜湿街、全息广告，青-洋红双色系 + 体积雾的电影感夜景。

## 高效组合（核心词组，中英对照）

| 中文 | English |
|------|---------|
| 赛博朋克 | cyberpunk |
| 霓虹巨都 | neon-lit megacity |
| 雨夜湿滑街道 | rain-slick streets |
| 全息广告 | holographic advertisements |
| 霓虹招牌发光 | glowing neon signs |
| 高科技低生活 | high-tech low-life |
| 青-洋红色板 | teal and magenta color palette |
| 体积雾 | volumetric fog |
| 夜景、电影感 | night, cinematic |
| 子类：霓虹城市全景/暗黑赛博/复古赛博/轻科幻 | neon cityscape / dark cyberpunk / retro cyberpunk / light sci-fi |

## 风格锁模板（整段复制）

**中文版**：
赛博朋克夜景：霓虹巨都、雨夜湿滑街道倒映霓虹、全息广告悬浮、发光招牌，高科技低生活质感；青-洋红色板、体积雾穿楼；光源布局写明——主光为【哪侧】霓虹招牌【色温/颜色】、辅光为全息广告冷光、轮廓光勾人物边缘；电影感构图。画面内招牌不出现可读文字。

**英文版**：
Cyberpunk night scene: neon-lit megacity, rain-slick streets mirroring neon, holographic advertisements, glowing neon signs, high-tech low-life; teal and magenta color palette, volumetric fog between towers; explicit light layout — key light from [side] neon sign [color], cool fill from holographic ads, rim light tracing the subject; cinematic composition. No readable text on signage.

## 光影/运镜偏好

光源布局四件套（光源位置+光源类型+光色/色温+时段）必写且逐镜复制（研究 §2 光影统一法），霓虹=多色点光源，按 `shared/lighting-system.md` 三层拼装；景别/机位词用 `shared/camera-dictionary.md`。

## 负面词与画质词策略

- **画质词基本全删**（研究 §3）：8k/RAW/masterpiece 在 Flux/GPT/即梦/MJ 是噪声（masterpiece 在 SDXL 反而拉向绘画感、MJ 完全忽略内联质量词【社区实证·Promgrammer】）；换成具体材质词（湿漉沥青反光、铬金属、霓虹玻璃管、全息贴膜）。
- **负面词通道**（研究 §3）：SD/SDXL 真负面框 5–15 词，本风格负面用途=物体清除+顽固缺陷（人群、乱码文字、光斑糊脸、过曝）；Midjourney `--no` 3–5 词（crowd, blurry text, overexposed face）——**MJ `--no` 官方定性=nudge 非绝对过滤**，正文写 "no X" 无效、必须用 `--no`、逗号分隔置尾、点名罕见反引入【官方·MJ docs（403，镜像交叉）】；Flux/GPT-Image/Nano Banana/即梦无负面通道（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）（2026-10-31 校订：原【即梦无负面框·推测】API 层升级官方实证）→ 正向改写「空旷街道、单人剪影、人脸清晰受光」。
- **文字处理**：中文霓虹招牌乱码高发——Flux 用引号写明文字内容+位置+字体（"bold industrial lettering"，研究 §3 Flux 特性），即梦/Seedream 中文引号写明；更稳做法是招牌不带可读文字。

## 翻车点与对策

| 翻车点（研究 §4-4） | 对策 |
|--------|------|
| 霓虹乱入所有风格（风格污染） | neon/霓虹只进本风格段；其他风格 skill 明确封堵 |
| 只堆 neon 不写光源布局 → 光影混乱 | 光源四件套（位置+类型+色温/时段）写全并逐镜复制（研究 §2） |
| 中文霓虹招牌文字乱码 | Flux/即梦引号内写明文字内容；或招牌纯色块无可读字 |
| 人物特写满屏光污染盖住人脸 | 显式写 `face clearly lit, rim light on face`（人脸清晰受光、面部轮廓光） |

## 双语示例（完整场景提示词）

**中文版**：
赛博朋克夜景，霓虹巨都、雨夜湿滑街道。中国男青年【角色锚点：银灰短发、黑色机能风外套、左耳银色耳夹】站在小巷口仰望全息广告，青-洋红色板、体积雾穿楼。光源布局：主光为画面右侧洋红霓虹招牌、冷青色全息广告补光、暖白轮廓光勾人物边缘，人脸清晰受光、面部轮廓光。中近景，胸口以上，低角度仰拍。招牌无可读文字，画面无水印。

**English version**：
Cyberpunk night scene, neon-lit megacity, rain-slick streets. A young Chinese man (anchors: silver-grey short hair, black techwear jacket, silver ear cuff on his own left ear) standing at the alley mouth looking up at a holographic advertisement; teal and magenta palette, volumetric fog between towers. Light layout: magenta neon sign key light from the right, cool teal holographic fill, warm white rim light tracing the subject; face clearly lit with rim light on the face. Medium close-up above the chest, low angle shot. No readable text on signage, no watermark.

## 朋克家族扩充（2026-10-30 用户方案）
- 赛博朋克：cyberpunk, neon lights, futuristic city, mechanical prosthetics, high tech low life, rainy night, holographic；负面词加 bright sunshine, nature（Blade Runner style 与 SKILL.md 禁专有名冲突，已删）。
- 蒸汽朋克：steampunk, brass, gears, Victorian era, steam-powered machines。
- 柴油朋克：dieselpunk, retro-futurism, art deco, heavy machinery。
参数：--stylize 250–750 增强艺术感。
