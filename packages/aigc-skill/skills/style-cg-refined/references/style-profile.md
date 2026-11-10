# 半写实精致 CG 渲染 · 风格档案

> 规格来源：用户 2026-10-27 参考级出视频指令（原子朋克机器人案例）——该案例即本风格的验收标尺。设计可风格化、渲染必须写实。

## 一、风格定位

电影剧照级的精致 CG：真实材质 + 自然光影 + 电影镜头语言。观感目标「Photorealism 真人实景拍摄质感」——**杜绝游戏 CG 感、杜绝塑料皮肤、杜绝动作迟钝僵硬**。

## 二、高效组合（核心词组，中英对照）

- 质感基座：`半写实精致CG渲染，电影级质感，超写实，极致逼真，真实材质质感 / semi-realistic refined CG render, cinematic film quality, hyper-detailed, photorealistic materials`
- 材质武器（写进内容段）：`哑光皮革、磨砂金属、织物纹理、细腻真实皮肤纹理、金属反光 / matte leather, brushed metal, fabric weave, detailed skin texture, metallic reflections`
- 镜头武器：`IMAX 胶片摄影机，Panavision C 系列镜头，变形宽荧幕，长焦压缩，浅景深，动态模糊 / IMAX film camera, Panavision C-series anamorphic lens, long lens compression, shallow depth of field, motion blur`

## 三、风格锁模板（整段复制）

**中文**：
> 半写实精致CG渲染，电影级质感，超写实，极致逼真，真人实景拍摄质感，杜绝游戏CG感。变形宽荧幕电影质感，IMAX 胶片摄影机搭配 Panavision C 系列镜头拍摄。胶片颗粒质感，低饱和度复古胶片滤镜；自然日光照明，强直射日光与自然光晕；画面明暗对比强烈，高光不过曝，暗部保留完整细节，明暗过渡自然，带轻微胶片柔光质感。

**英文**：
> Semi-realistic refined CG render, cinematic film quality, hyper-detailed, photorealistic, shot-on-film realism, never game-CG look. Anamorphic widescreen, shot on IMAX film camera with Panavision C-series lenses. Film grain, low-saturation filmic color grading; natural daylight, strong direct sunlight with natural lens flare; strong contrast, highlights never blown, shadows retain full detail, smooth tonal transitions, subtle filmic softness.

## 四、色彩与影调配方

- **双高对比色调**：按题材选一对撞色写死全剧（参考案例：复古暖橙 + 海盐蓝），逐镜复制
- 胶片颗粒质感 + 低饱和度胶片滤镜
- 曝光规则：高光不过曝、暗部保留完整细节、明暗过渡自然
- 光影四件套逐镜复制：光源位置 + 类型 + 色温 + 时段（`shared/prompt-formula.md` §四）

## 五、翻车点与对策

| 翻车点 | 对策 |
|--------|------|
| 游戏 CG 感 / 塑料皮肤 | 材质词入正文（哑光皮革/皮肤纹理）；禁「游戏画面」；写曝光规则逼出真实光比 |
| 卡通词混入（平涂/描边/色块） | cel 系词黑名单——本风格禁入；混写=渲染风格撕裂 |
| 画质词堆砌（8k/ultra-detailed） | 弱偏置且稀释注意力【社区实证·Promgrammer】——换具体材质词+相机词（机型/镜头/胶片）；intricate details/super detail 族同理，过用产生 busy 的「AI 感」纹理【社区实证·Promgrammer】（2026-10-31 补注） |
| 动作僵硬迟钝 | 动作逐拍写动词（掏→按→抛→压帽→耸肩）；运镜写速度；动态模糊标注 |
| 光影乱（多镜不同光） | 光影四件套+色调对撞组逐镜复制；场景光影锁定 |
| 参考与描述脱节 | @资产引用必须跟完整文字描述（双保险，见 video-producer 规则） |

## 六、双语示例（近景动作镜 · 出图）

**中文**：
> 半写实精致CG渲染，电影级质感。身形修长的人形机器人，1960年代原子朋克设计，面部LED显示屏显示像素表情，身穿棕色牛仔帽、黑色哑光高腰皮衣夹克、皮手套、牛仔腰带枪套。近景，浅景深，长焦压缩空间；IMAX 胶片质感，胶片颗粒，暖橙与海盐蓝高对比，强直射日光，高光不过曝暗部留细节。哑光皮革与磨砂金属材质细节清晰。

**英文**：
> Semi-realistic refined CG render, cinematic quality. A slender humanoid robot, 1960s atompunk design, LED pixel face display, brown cowboy hat, black matte leather jacket, leather gloves, gun belt holster. Close-up, shallow DOF, long lens compression; IMAX film look, grain, warm-orange and sea-salt-blue high-contrast grade, strong direct sunlight, controlled highlights, detailed shadows. Matte leather and brushed metal materials in crisp detail.

（翻车案例与实战校准：沉淀到本表，标日期来源。）
