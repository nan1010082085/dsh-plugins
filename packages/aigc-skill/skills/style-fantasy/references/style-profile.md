# style-fantasy 风格档案（西方玄幻）
核心视觉要素：中世纪城堡、骑士/法师/精灵、魔法光效、羊皮纸质感、史诗级构图、繁复盔甲。
英文关键词：western fantasy / epic fantasy art; medieval / magic / dragon / knight / wizard; oil painting style / dark fantasy; intricate armor; glowing runes。
> **注记（2026-10-31，batch5 §5.2）**：原「Greg Rutkowski（画师风增强）」已于 P0 删除——**画师名增强=SD1.5 时代过时写法**，SD 2.0 起 Stability 移除在世艺术家风格模仿，仅老 SD1.5 底模有效、SD2+/SDXL/Flux/MJ 上无效或被策略屏蔽，**禁作通用增强词**（社区靠 LoRA/微调「复活」该风格）【新闻实证·decrypt / BBC】。
指令模板：种族/职业 + 服装/武器 + western fantasy, epic lighting, oil painting style, intricate details, magical atmosphere, fantasy concept art + 画质参数。
示例：An elven ranger with a bow, intricate leather armor, ancient forest background, glowing fireflies, epic lighting, oil painting style, highly detailed, fantasy concept art --ar 16:9 --v 6.0
负面词：modern, sci-fi, lowres, text。参数：MJ 用 --v 6.0。

## 词库标注与通道注记（2026-10-31，batch5 §5.2/§⑥）

- 词库主体（epic lighting / intricate armor / fantasy concept art / oil painting style / dark fantasy / magical atmosphere）在 MJ/SD fantasy prompt 库通用【社区经验·promptspace / therightgpt】
- `intricate details` / `super detail` 族归材质填料词，**过用产生 busy 的「AI 感」纹理**，宜节制【社区实证·Promgrammer】
- Midjourney `--no` **官方定性=nudge 非绝对过滤**：正文写 "no X" 无效、必须用 `--no`、逗号分隔置尾、点名罕见反引入【官方·MJ docs（403，镜像交叉）】
- 即梦/Seedream（API 层）无负面参数（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）→ 负面意图正向改写
