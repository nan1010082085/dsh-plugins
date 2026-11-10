# style-photoreal 风格档案（写实摄影）

> 依据：`docs/superpowers/reports/2026-10-27-prompt-optimization-research.md` §4-5、§3（BFL 官方 + imagetoprompt）+ `shared/style-library.md` 通用纪律。未查证处标【推测】。

## 风格定位

写实摄影质感：机型+镜头+光圈+胶片/调色四件套说话，追求真实影像（含商业精致/纪实粗糙/复古胶片分支）。

## 高效组合（核心词组，中英对照）

| 中文 | English |
|------|---------|
| 写实人像/照片 | photorealistic portrait of [主体] |
| 机型+镜头+光圈（核心） | shot on Canon EOS R5, 85mm f/1.4 |
| 浅景深/背景虚化 | shallow depth of field, bokeh |
| 黄金时刻窗光 | golden hour window light |
| 自然皮肤纹理 | natural skin texture |
| 轻微胶片颗粒 | slight film grain |
| 柯达 Portra 400 调色 | Kodak Portra 400 colors |
| 80s 复古 | film grain, warm color cast, soft focus |
| 2000s 卡片机 | early digital camera, flash photography, candid |
| 纪实粗糙感 | documentary photography, --style raw（MJ） |

## 风格锁模板（整段复制）

**中文版**：
写实摄影，[主体]的写实人像：Canon EOS R5 拍摄，85mm f/1.4 镜头，浅景深背景虚化，【光源：黄金时刻窗光/柔光箱/阴天漫射——光源位置+类型+色温+时段写全】，自然皮肤纹理，轻微胶片颗粒，Kodak Portra 400 调色。真实影像质感，无插画感、无卡通感。

**英文版**：
Photorealistic portrait of [subject], shot on Canon EOS R5, 85mm f/1.4, shallow depth of field with bokeh, [light source: golden hour window light / softbox / overcast diffusion — position + type + color temperature + time of day], natural skin texture, slight film grain, Kodak Portra 400 colors. Real photographic look, no illustration or cartoon feel.

## 光影/运镜偏好

自然光源叙事（golden hour 窗光、阴天漫射、闪光灯直闪），光源四件套写全；景深用光圈词控制（f/1.4 虚化、f/8 全清晰），景别/机位词用 `shared/camera-dictionary.md`，光影拼装按 `shared/lighting-system.md`。

## 负面词与画质词策略

- **quality soup 全删**（研究 §3/§4-5）：8k/ultra-detailed/RAW photo 堆叠无益、甚至「AI 味」；masterpiece 在 SDXL 把写实拉向绘画；Midjourney 忽略内联质量词（用 `--style raw`/`--stylize`/`--quality`）【社区实证·Promgrammer】。**写实目标用相机词汇代替质量词**——机型+镜头+光圈+胶片是核心（BFL：写具体机型胶片比 "professional photo" 强得多）。
- **负面词通道**（研究 §3）：SD/SDXL 真负面框 5–15 词（plastic skin、cartoon、illustration、3d render、anime、deformed hands、extra fingers、watermark、text、jpeg artifacts——负面质量词常比正面管用【社区实证·Promgrammer】）；Midjourney `--no` 3–5 词（cartoon, illustration, plastic skin, text）——**MJ `--no` 官方定性=nudge 非绝对过滤**，正文写 "no X" 无效、必须用 `--no`、逗号分隔置尾、点名罕见反引入【官方·MJ docs（403，镜像交叉）】；Flux/GPT-Image/Nano Banana/即梦无负面通道（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）（2026-10-31 校订：原【即梦无负面框·推测】API 层升级官方实证）→ 正向改写「自然皮肤纹理、真实照片质感、画面干净」。
- **手部/皮肤专项**：负面加 `plastic skin` 或正向写 `detailed skin texture`（研究 §4-5）。

## 翻车点与对策

| 翻车点（研究 §4-5） | 对策 |
|--------|------|
| `masterpiece` 在 SDXL 上把写实拉向绘画 | 删质量词，换相机四件套 |
| `8k, ultra-detailed, RAW photo` 堆叠无益、带「AI 味」 | quality soup 清零；细节靠具体材质/镜头词 |
| 手部崩坏、皮肤塑料感 | 负面加 plastic skin/畸形手；正向写 detailed skin texture |
| MJ 默认「过于精美」缺纪实感 | 加 `--style raw` + documentary photography |
| 卡通词混入（反向污染） | cel/cartoon/animated 词黑名单扫描 |

## 双语示例（完整场景提示词）

**中文版**：
写实摄影，中国女青年【角色锚点：黑色长直发、杏眼、米色针织衫】的写实人像：Canon EOS R5 拍摄，85mm f/1.4 镜头，浅景深背景虚化；黄金时刻窗光从画面左侧进入、暖色约 3200K、傍晚，自然皮肤纹理，轻微胶片颗粒，Kodak Portra 400 调色。她靠在咖啡馆窗边回眸，神态松弛。中近景，胸口以上，三分法构图。真实影像质感，无插画感，画面无文字无水印。

**English version**：
Photorealistic portrait of a young Chinese woman (anchors: long straight black hair, almond eyes, beige knit sweater), shot on Canon EOS R5, 85mm f/1.4, shallow depth of field with bokeh; golden hour window light from the left, warm ~3200K, late afternoon; natural skin texture, slight film grain, Kodak Portra 400 colors. She leans by a cafe window glancing back, relaxed expression. Medium close-up above the chest, rule of thirds. Real photographic look, no illustration feel, no text, no watermark.
