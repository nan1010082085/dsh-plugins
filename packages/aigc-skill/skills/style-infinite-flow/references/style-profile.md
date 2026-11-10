# style-infinite-flow 风格档案（无限流）
核心视觉要素：空间撕裂、多重世界叠加、神秘大门/通道、数据代码、系统 UI、诡异氛围。
英文关键词：infinite flow / multiverse; dimensional rift / space distortion; portal / endless corridor; system interface / glitch art; survival game / horror mystery; mixed styles / parallel dimensions。
指令模板：主角 + 空间/维度异常 + infinite flow, multiverse portal, dimensional gateway, space distortion, floating data codes, system UI overlay, surreal atmosphere, cinematic + 画质参数。
示例：A person in casual clothes standing before a giant mysterious door, behind the door a mix of cyberpunk city and medieval castle, space distortion, floating data codes, infinite corridor, surreal atmosphere, cinematic, highly detailed --ar 16:9
负面词：normal street, sunny day, lowres, text。参数：MJ 可提 --stylize 250–750。

## 实证词库（2026-10-31 补料，batch5 §5.3）

上方既有词（dimensional rift / portal / space distortion / floating data codes / system UI overlay）方向对但原无出处，以下为带源补强：

- **M.C. Escher = 不可能空间风格锚**【社区实证·flowpixai】：`Escher-inspired spatial paradox`——训练数据标注率高，AI 理解 "Escher-inspired" ≈ 非欧空间。现 skill 原缺这个锚，优先使用
- **五类循环空间词组**（每类可直接抄）【社区实证·flowpixai】：
  | 类型 | English |
  |------|---------|
  | 莫比乌斯走廊 | Möbius strip corridor / Escher-inspired spatial paradox |
  | 彭罗斯阶梯 | Penrose staircase |
  | 镜像递归房间 | infinite reflections |
  | 嵌套走廊 | fractal-like nested spaces |
  | 时空碎片拼贴 | fragments from different time periods |
- **一人多身**【社区实证·flowpixai】：同一角色多版本同框 + `glowing temporal threads`
- **时空间隙 / 异化时钟**【社区实证·flowpixai】：`a crack in reality` / `temporal energy`；异化时钟
- **glitch 词表**（补 system UI/诡异氛围段）【社区实证·designstylebook】：`RGB channel shift, datamosh, scanlines, pixel sorting, databending, corrupted signal, compression artifact`；Sci-Fi HUD / system UI overlay 成熟词条【社区经验·completeaitraining】

## 手法与边界（2026-10-31，batch5 §5.3）

- **多副本统一靠「贯穿性视觉锚点」而非统一画风**【社区实证·flowpixai】：副本风格要多样（词例：pastel gothic horror 恐怖童谣 / cyberpunk xianxia 赛博道观 / wasteland amusement park 废土游乐场），跨副本一致性由重复出现的锚点物/色/符号承担
- **无限流≠赛博朋克**【社区实证·flowpixai】：无限流是「多世界切换机制」，视觉重点在**过渡空间**（门/电梯/走廊/屏幕）——不是霓虹都市本体；霓虹词仍受 style-cyberpunk 污染禁令约束

## 负面词与通道注记（2026-10-31，batch5 §⑥）

- Midjourney `--no` **官方定性=nudge 非绝对过滤**：正文写 "no X" 无效、必须用 `--no`、逗号分隔置尾、点名罕见反引入【官方·MJ docs（403，镜像交叉）】
- 即梦/Seedream（API 层）无负面参数（官方：火山 API 无 negative_prompt 参数 2026-10【官方·volcengine】；网页/App UI 层【未定·需一次 UI 实测】）→ 负面意图正向改写「画面干净、无乱码文字」
