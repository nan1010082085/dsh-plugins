# style-anime 风格档案（日漫 / 二次元）

> 依据：`docs/superpowers/reports/2026-10-27-prompt-optimization-research.md` §4-2、§3 + `shared/style-library.md` §二。未查证处标【推测】。

## 风格定位

日系动漫插画：干净线稿 + 赛璐璐平涂上色，色彩层次清晰，非写实的二次元质感（吉卜力味为可选变体）。

## 高效组合（核心词组，中英对照）

| 中文 | English |
|------|---------|
| 动漫插画 | anime illustration |
| 高对比活力色彩 | vibrant colors |
| 赛璐璐平涂 | cel shaded |
| 干净线稿 | clean line art |
| 日系二次元插画质感 | Japanese anime aesthetic, non-photorealistic |
| 吉卜力变体：田园、柔和水彩背景 | Studio Ghibli style, pastoral, soft watercolor backgrounds |
| Niji 模式 | --niji（Midjourney 二次元优化通道） |
| SD 侧 Danbooru 标签体 | 1girl/1boy, solo, [发型发色], [服装], [表情], [场景] |

## 风格锁模板（整段复制）

**中文版**：
日系动漫插画，干净线稿，赛璐璐平涂上色，色彩层次清晰，日系二次元质感，非写实；线稿干净利落、阴影平涂分层不糊；人物剪影清晰，五官比例稳定，发丝成束、发色纯正；纯色/简洁背景。细节一致，无变化。

**英文版**：
Japanese anime illustration, clean line art, cel-shaded flat coloring, clear color layering, vibrant colors, non-photorealistic; crisp lines, flat layered shadows with no blur; readable silhouette, stable facial proportions, stylized hair clumps with pure hair color; solid or simple background. Consistent details, no variation.

## 光影/运镜偏好

平涂分层光影、柔和漫射为主，禁糊阴影；景别/机位词用 `shared/camera-dictionary.md`（生图只写固定景别不写运镜），光影拼装按 `shared/lighting-system.md`。

## 负面词与画质词策略

- **画质词分平台**（研究 §3；2026-10-31 依 batch5 §1 重写——原写「masterpiece/best_quality 强有效且放最前」，两处均修订）：
  - **适用域**：Booru 质量词只在 Booru 训练族（NovelAI/Animagine/Pony）是字面训练信号、有效；**SDXL base/Flux 弱甚至反作用**（`masterpiece` 把画面拉向绘画感、远离摄影感）；**Midjourney 完全忽略内联质量词**（用 `--style raw` / `--stylize` / `--quality`）【社区实证·Promgrammer】
  - **masterpiece 降级**：NAI 现行体系里 `masterpiece` 是 Aesthetic Tag、仅 V4.5+ 生效；逐词对照 **`very aesthetic` 最强**、`amazing quality` 显著（会改画风）、**`best quality` 几乎无变化**、`absurdres` 几乎无变化【官方·NAI docs】【社区实证·note.com】（2026-10-31 校订：原写「强有效」）
  - **位置分底模**：Animagine XL 4.0 **官方要求质量词放句尾**（`masterpiece, high score, great score, absurdres` 前置会让 artist tags 失效、概念/画风出错）【官方·CagliostroLab】；NAI 官方质量词开关也是句尾追加【社区实证·note.com】；NAI V3 词序越靠前越强【官方·NAI docs】；Pony score 梯子放句首（2026-10-31 校订：原写「放最前」一刀切）
  - **Pony 系**：用 score 梯子 `score_9, score_8_up, score_7_up` 放句首，masterpiece 无效；**Pony V7 弱化 score 词**，改用 `score_8`/`score_7_up`；`source_*`/`rating_*` 仅在训练过的模型生效【社区实证·artificialguy / Civitai】
  - **≤3 个**：>3–4 个质量词稀释注意力、可能属性泄漏；成熟强底模上质量词组的画面位移可小于随机 token，弱/老底模低步数才更有效【社区实证·Promgrammer】
  - **8k/4k 禁挂**：只偏置训练 caption、不改分辨率【社区实证·Promgrammer】
  - **分词**：NovelAI 用空格、老 Animagine 用下划线，随底模而定【社区实证·Promgrammer】
- **负面侧质量词更有效**：low quality, worst quality, blurry, jpeg artifacts, extra fingers, watermark, text 等负面质量词**常比正面质量词更有效**，SD 侧优先把配额给负面框【社区实证·Promgrammer】（2026-10-31 新增，batch5 硬要求 6）
- **禁写实词**：photorealistic / 写实皮肤 / 85mm / DSLR 混入 → **漂向写实/半写实**（半写实是真实存在的中间吸引域），易出半写实不协调感【社区实证·Reddit PSA + Civitai Semi-Realistic Blend XL】（2026-10-31 校订：原写「= 半写实恐怖谷」，依 batch5 §3 降级——恐怖谷是可能后果而非必然）（研究 §7 修正 1）。
- **负面词通道**（研究 §3）：SD/SDXL 真负面框 5–15 词（写实照片、西方卡通、3D 写实渲染、模糊线稿、糊阴影、草稿线、多指、坏手、画崩脸、画师签名 + 人设显老词黑名单逐条）；Midjourney `--no` 3–5 词（realistic photo, blurry lines, extra fingers, text）——**MJ `--no` 官方定性=nudge 非绝对过滤**，正向强提示可覆盖、点名某物罕见反引入、正文写 "no X" 无效必须用 `--no`、多词逗号分隔置尾【官方·MJ docs（403，镜像交叉）】；Flux/GPT/即梦无负面通道（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）（2026-10-31 校订：原【即梦无负面框·推测】API 层升级官方实证）→ 正向改写「干净线稿、平涂阴影清晰、细节一致」。
- **负面词纪律**【经验·内部】：针对性 10 词 > 通用 50 词；别把正向词写进负面；负面只能去缺不能补缺。

## 翻车点与对策

| 翻车点（研究 §4-2） | 对策 |
|--------|------|
| 手部崩坏 / 多余肢体 | 负面加 `extra fingers, bad anatomy`（SD 系）或手部 LoRA；手部特写加畸形手负面 |
| 画面文字乱码 | 画面内不写字；确需文字时 Flux/即梦用引号写明内容（研究 §4-4 同策） |
| 混写实词 → 漂向写实/半写实、易出半写实不协调感（2026-10-31 校订：原写「半写实恐怖谷」，依 batch5 §3 降级【社区实证·Reddit PSA/Civitai】） | 写实词黑名单扫描；负面封堵写实照片/西方卡通 |
| Pony 系吃 masterpiece 无效 | 换 score 梯子 `score_9, score_8_up, score_7_up`（V7 弱化 score 词改 `score_8`/`score_7_up`；`source_/rating_` 仅训练过的模型生效）【社区实证·artificialguy/Civitai】 |
| 每张图换一张脸（角色漂移，无出处） | 每图复述同一组固定特征短语 + 「细节一致，无变化」；挂主体三视图；即梦开「引用主体」 |
| 画风漂移（忽日漫忽写实） | 风格段每图同源复制；一部剧锁 1 种风格 |

## 双语示例（完整场景提示词）

**中文版**：
日系动漫插画，干净线稿，赛璐璐平涂上色，色彩层次清晰，非写实。单人中国少女【角色锚点：栗色双马尾、琥珀瞳、星星发绳系在角色自身右侧】穿藏蓝水手服，坐在放学后的教室窗边翻书，夕阳从窗口斜射、平涂暖色阴影分层清晰，窗外操场虚化为色块。近景，肩部以上，三分法构图。细节一致，无变化。不要文字、不要水印。

**English version**：
Japanese anime illustration, clean line art, cel-shaded flat coloring, clear color layering, non-photorealistic. A solo Chinese schoolgirl (anchors: chestnut twin-tails, amber eyes, star hair ties on her own right side) in a navy sailor uniform, reading a book by the classroom window after school; slanting sunset light through the window with clean flat warm shadow layers, the playground outside blurred into color blocks. Close-up framing above the shoulders, rule of thirds. Consistent details, no variation. No text, no watermark.
