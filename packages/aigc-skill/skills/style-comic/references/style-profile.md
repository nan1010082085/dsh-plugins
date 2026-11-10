# style-comic 风格档案（漫剧 / 动漫动画）

核心视觉要素：动态分镜、粗黑轮廓线、速度线、网点背景、高饱和色彩、夸张表情。
英文关键词：comic book style / manga style / graphic novel; dynamic composition; speed lines / action lines; halftone dots; bold ink outlines; anime key visual; storyboard panel。
指令模板：主体描述 + 动作/表情 + comic book style, dynamic angle, speed lines, bold black outlines, halftone effect, vibrant flat colors, manga aesthetic, action scene + 画质参数。
示例：A young warrior shouting, holding a glowing sword, comic book style, dynamic angle, speed lines, bold black outlines, vibrant flat colors, manga aesthetic, action scene --ar 3:4 --niji 6
负面词：3D, realistic, photo, lowres, text, watermark。参数：MJ 用 --niji 6。

## 词库带源补强（2026-10-31，batch5 §5.1）

- **美漫三件套**【社区实证·artpromptsgenerator】：`bold ink outlines` + `flat cel color` + `halftone/Ben-Day dots`——三件在场才卖得出「漫画感」
- **时代词维度**（缺的正是这维；时代不同画面完全不同）【社区实证·artpromptsgenerator】：`golden-age halftone`（黄金时代网点）/ `90s grim-dark`（90 年代黑暗风）/ `modern flat digital`（现代平涂数码）/ `ligne claire`（清线派）
- **动态镜头比形容词更能卖能量感**【社区实证·artpromptsgenerator】：`low angle` / `Dutch tilt`（荷兰角）+ `speed lines / action lines`
- **MJ 侧**：comic book style 是 Midlibrary 实测大类（525 styles / 249 SREF codes），可走 SREF 快捷通道【社区实证·Midlibrary】

## halftone / screentone 禁混写（2026-10-31，batch5 硬要求 8）

halftone/Ben-Day dots 是**西漫**印刷传统、screentone 是**日漫**印刷传统，混用会 muddy（halftone+manga 混写尤其糟），**commit 其一**【社区实证·artpromptsgenerator】。
注：上方指令模板里的 `halftone effect + manga aesthetic` 即混写示例——出图时按目标传统二选一（西漫=halftone/Ben-Day，日漫=screentone），不要照抄混写。

## 负面词与通道注记（2026-10-31，batch5 §⑥）

- 负面词 `3D, realistic` 的实测效果**无专门实证**【查不到】，方向合理（与写实类互斥）但别当已验证
- Midjourney `--no` **官方定性=nudge 非绝对过滤**：正向强提示可覆盖、点名某物罕见反引入、正文写 "no X" 无效必须用 `--no`、多词逗号分隔置尾【官方·MJ docs（403，镜像交叉）】
- 即梦/Seedream（API 层）**无负面参数**（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）→ 负面意图正向改写「线条干净、画面无文字无水印」
