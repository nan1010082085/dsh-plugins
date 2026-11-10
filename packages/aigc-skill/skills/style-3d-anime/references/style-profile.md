# style-3d-anime 风格档案（精致 3D 日漫 CG）

> 风格定位见 SKILL.md：**日漫的脸，3D 的质感**。本文件是风格段唯一取料处。

## 风格锁模板（整段复制）

```
精致3D日漫CG渲染，顶尖3D二次元画面质感，日系动漫角色设计（大眼睛、精致小巧五官、动漫头身比例），3D立体建模，次表面散射皮肤质感，发丝根根分明，服饰材质细腻（织物纹理/皮革质感/金属反光清晰），电影级光影，色彩明快通透，画面干净利落，细节清晰，3D动画电影级画质。
```

English:

```
Refined 3D anime CG rendering, top-tier 3D Japanese anime aesthetic, Japanese anime character design (large expressive eyes, refined small nose and mouth, anime body proportions), full 3D modeling with subsurface scattering skin, individually rendered hair strands, fine fabric/leather/metal material detail, cinematic lighting, vibrant clean colors, crisp detail, 3D animated-feature film quality.
```

> **模板词效标注（2026-10-31）**：模板中「次表面散射皮肤质感 / subsurface scattering skin」在即梦/Seedream/MJ 上属**未验证借用**（SD 写实侧有实证、3D 动漫侧无 A/B，空白【查不到】）；「发丝根根分明」经验写法【经验·内部】；「精致3D日漫CG渲染」方向成立（≈ 社区 "3D rendering anime-style" 写法）【社区经验】。详见下方「词效标注」。

## 高效组合（按需摘取）

| 组 | 词组 |
|----|------|
| 脸部（日漫锚） | 大而有神的眼睛、精致小巧五官、动漫比例、柔和脸部轮廓、通透瞳孔高光 |
| 皮肤/毛发（3D 锚） | 次表面散射皮肤、细腻皮肤质感、发丝根根分明、柔顺发丝光泽 |
| 材质 | 织物纹理清晰、皮革质感、金属反光、半透明材质、精细建模 |
| 光影 | 电影级光影、明快通透、色彩干净、柔和体积光、轮廓光 |
| 画质 | 3D动画电影级画质、细节清晰、高清4K |

> **词效标注（2026-10-31，batch5 §2.3/§④）**：「次表面散射」= **跨模型借用**——SD 系写实侧有效（含推近+柔背光副作用）【社区实证·Reddit r/StableDiffusion】、与 3D 渲染语料关联强于 photorealistic【社区实证】、Flux 单词弱需 SSS LoRA【社区实证·旁证】，但 **Seedream/即梦/MJ、SDXL 动漫侧无任何 A/B 实证（空白）**【查不到】；「织物纹理/皮革质感/金属反光」归 intricate_details 族，过用产生 busy 的「AI 感」纹理、宜节制【社区实证·Promgrammer】；「发丝根根分明」无对照实证，属经验写法【经验·内部】【查不到】；「高清4K」不改分辨率（见 style-anime 画质词策略），仅作氛围词慎用【社区实证·Promgrammer】。

## cel-shading 锁质感词库（2026-10-31 补料，batch5 §2.1）

本风格的渲染质感可叠加「赛璐璐化」控制词（3D 渲染主体转平涂手绘观感：硬轮廓、2–3 档色块阴影、高饱和平涂、极少渐变）：

- **锁质感五件套**【社区经验·Anifusion（工具方实测）】：`cel-shaded`、`two-tone shadow blocks`（两档色块阴影）、`ink line outline`（1-pixel matte ink contours）、`flat color fields`、明确光向（如 `top-left key light`）+ `rim light`
- **明文翻车词**【社区经验·Anifusion】：`soft-glow`、`painterly` 修饰词——"they fight the look"，与 cel 质感直接对冲，**禁入本风格段**
- **halftone / screentone 禁混写**【社区实证·artpromptsgenerator】：halftone/Ben-Day dots 是西漫印刷传统、screentone 是日漫印刷传统，两种传统混用会 muddy（halftone+manga 混写尤其糟），出图时 **commit 其一**
- **词锁不住时的社区答案是 LoRA**：SD 侧给动漫图加 3D 感历史上靠 3DMM LoRA（trigger `3DMM`）；Flux 侧 cel-shading 有专用 LoRA（Civitai "Cel Shading Style (CGI Anime)"）——自然语言底模上风格词锁不住就上 LoRA，不要无限堆词【社区实证·Civitai / stable-diffusion-art】

## 边界词表（防漂向邻居风格）

| 禁入本风格 | 归属 | 混入后果 |
|-----------|------|---------|
| photorealistic/真人皮肤质感/85mm/DSLR/胶片颗粒/明星脸 | style-cg-refined / style-photoreal | 日漫脸被写实化，**漂向写实/半写实，易出半写实不协调感**（2026-10-31 校订：原写「恐怖谷」，依 batch5 §3 降级——写实词混入会拉向写实/半写实有实证【社区实证·Reddit PSA + Civitai】，恐怖谷是可能后果而非必然） |
| 赛璐璐/粗描边/色块平涂/扁平/2D插画 | style-anime | 3D 质感被压平成 2D【推测】（机理自洽——flat color fields 正是 cel 定义词【社区经验·Anifusion】——但无直接 A/B 对照） |
| soft-glow/painterly 修饰词 | 无归属（翻车词） | 与 cel 质感对冲，明文翻车词【社区经验·Anifusion】 |
| halftone 与 screentone 混写 | 二选一 | 两印刷传统混用 muddy，commit 其一【社区实证·artpromptsgenerator】 |
| 像素风/体素/乐高 | 其他 | 风格崩坏 |

## 翻车点与对策

| 翻车点 | 对策 |
|--------|------|
| 脸漂成写实脸（大眼睛词被忽略） | 脸部日漫锚词前置放句首组合；验收首查眼睛比例。**注（2026-10-31，batch5 §2.3）**：「前置」仅 NAI 类底模有据（V3 词序前置强【官方·NAI docs】）；Animagine XL 4.0 官方主张质量词句尾、前置会使 artist/风格词失效【官方·CagliostroLab】；即梦/Seedream 上前置效果**无实证**【查不到】——顺序敏感按底模定，别当通用法则 |
| 渲染漂成 2D 平涂 | 3D 锚词（次表面散射/立体建模）必须在场；验收查皮肤体积感 |
| 风格词在自然语言底模锁不住（词效有限） | 社区答案是 LoRA：SD 侧 3DMM LoRA（trigger `3DMM`）、Flux 侧 Cel Shading Style LoRA【社区实证·Civitai / stable-diffusion-art】；不要无限堆词 |
| 发丝糊成片状 | 「发丝根根分明」显式写；验收查发际线与发梢 |
| 手部畸变 | 沿通用验收（手指完整/数目正确） |
| 风格与 cg-refined 混写 | 一剧一风格；换风格=整段替换风格锁句，禁两套词并存 |

（2026-10-28 建档。新实战结论回写本表，标日期与来源。）
