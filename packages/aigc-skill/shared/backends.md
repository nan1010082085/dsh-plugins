# 生成后端适配层（可插拔 · 2026-10-27 用户定）

> **套件不绑定任何单一生成平台。** skill 的身份是「虚拟导演 + 视频/图片提示词工程师」——导演方法论（六要素、时间片、转场交代、情绪可视化、风格库、光影体系）是**后端无关的通用核心**；长度限制、分段规则、参考图语义、负面词通道是**后端方言**。前提：目标后端有对应的 MCP / CLI 工具接入（报价、生成、验真三件事都要能自动化，缺一走手动路径）。

## 一、通用核心 vs 后端方言

| 层 | 内容 | 适用 |
|----|------|------|
| **通用核心**（永远不变） | 六要素提示词（主体外貌/动作/场景/光影/焦段运镜/音效）、时间片制（一片一动作一运镜）、转场交代（时间+地点+过渡）、情绪可视化、导演风格库、三层光影、7 项自检（违禁词/裸英文/冲突检测等语义项） | 所有后端 |
| **后端方言**（按后端切换） | 提示词长度上限、单次生成时长上限与分段策略、参考图语义（多参考/首帧/首尾帧）、负面词通道、比例与分辨率参数、报价接口、验真方式 | 见下表 |

## 二、后端方言表

| 后端 | 工具接入前提 | 提示词方言 | 参考图语义 | 负面通道 | 验真 |
|------|------------|-----------|-----------|---------|------|
| **即梦 / Seedance（默认）** | dreamina + dreamina-canvas 双 CLI（**无 MCP server**，全部走命令行；dreamina 管账号/生成/query，dreamina-canvas 管画布/节点/资源/报价/模型） | 中文无字数上限（2026-11-05 用户令废除 ≤500 红线；实证 917–1288 字正常出片）；单次 ≤15s 超出自动分段 | 默认多参考图（说「当首帧」才走首帧）；m2v 最多 9 图，`--ref res:<uuid>` | 无真负面 → 正向改写（「画面干净、无多余文字」） | `resource get`（status=success）+ `node find` |
| **可灵 / Kling** | 可灵 MCP / API | 中文 ≤800 字量级【未校准·估计】；单次 ≤10s | 首帧/尾帧+运动笔刷语义 | 有负面词参数 | 按其任务查询接口 |
| **海螺 / MiniMax** | mmx CLI / MCP | 中文 ≤600 字量级【未校准·估计】；单次 ≤10s | 图生视频参考帧 | 部分支持 | mmx 查询接口 |
| **小云雀 xyq** | pippit-tool-cli（generate-image/generate-video/query-result/get-credit-balance） | 中文直传；**默认图模型=智能图片V2.5 Fast（2026-10-28 用户定；测试与常规出图一律 Fast，Pro 仅用户点名时用）**；`--ratio` 数字枚举（2=16:9/3=9:16/6=1:1）、`--resolution` 1K/2K/4K、`--effort` low→max；实测 智能图片V2.5 Pro ≈6 积分/张 1K/high | `--image` 多参考图；**i2i 排版被参考图锚定**（宫格原样复刻，文字「忽略」无效——立绘用画框锁，见 character-prompts §1.7） | 无真负面 → 正向改写 | query-result 异步轮询（**输出多行 JSON，勿 tail -1**）+ --download-dir 自动下载 |
| **Midjourney** | 仅手动路径（无官方 API） | 短英文 prompt + 参数尾巴（--ar 等） | 图片参考（sref/cref 语义） | `--no` 真负面 | 人工验图 |
| **SiliconFlow（pyflow.icu 平台）** | SiliconFlow REST（`api.siliconflow.cn/v1`，Bearer key 经平台 .env 注入，不入库） | 中文 prompt 一梯队；`images/generations`（model/prompt/image_size/batch_size → images[].url）；实测模型：图像 **Qwen/Qwen-Image**（中文最强）、Qwen-Image-Edit（参考图编辑）、Tongyi-MAI/Z-Image-Turbo（快）、Kwai-Kolors/Kolors；视频 **Wan-AI/Wan2.2-T2V-A14B / I2V-A14B** | Qwen-Image-Edit 走参考图编辑语义 | Qwen 系正向改写 | 图片 URL 时效 24h，落地即下载入库 |
| **SD / ComfyUI** | 本地 ComfyUI 工作流 | 提示词自由度高，无硬长度 | ControlNet/IP-Adapter 语义 | 真负面词表 | 本地产物 |

**一致性参数语义（2026-10-27 调研修正）**：`--seed` 只用于 A/B 测试与构图复现，**不锁人物**（MJ 官方明言）；人物锁定各后端不同——MJ 用 `--cref/--cw 75-85`（不保服装，服装正文写全）+`--sref` 锁风格；SD/Flux 用 IP-Adapter/PuLID/InstantID/LoRA；即梦/多图模型用「每图职责分工」参考图。画质词同理分平台（Booru 系 masterpiece 有效、SDXL 写实换相机词、Flux/MJ/GPT/即梦删掉），详见 `docs/superpowers/reports/2026-10-27-prompt-optimization-research.md` §③。

（量级数字是起点不是枷锁——各后端版本迭代后按其官方文档校准，校准结论写回本表。）

**即梦出片计价实测（2026-10-29 node quote 实测，seedance_2.0_fast_vip / 720P / 16:9 / m2v）**：
- **模型价格矩阵（720P 实测）**：`seedance_pro_fast` **2 积分/秒**（5s=10、10s=20；仅 t2v/first_last_frame、**单参考**、时长 5–10s——**只配无脸/纯手部/空镜；角色镜禁用**，单参考无法同时锚人物+场景）；`seedance_2.0_fast_vip` 6 积分/秒（m2v 多参考 ≤9 图、4–15s，角色镜默认）；`seedance_2.0_mini` 同 6 积分/秒（无折扣）；`seedance_2.5` 20 积分/秒（≤30s、480p 起，旗舰）
- **出片提示词零压缩铁律（generation-workflow L109，2026-10-29 烧 58 积分实证）**：分镜镜块四段式=出视频指令，从 Notion 逐字节传入，禁止压缩/改写/自创描述块；run 前 SHA-256 对账 + 参考图覆盖校验（露脸角色全挂，每角色≤正面1+侧视1）双闸，任一不过禁跑。试产 2-3 镜验的是**变脸/服装/运镜**三件事（不是比模型档位），过检锁参后批量，预算含 30% 重生成余量（数值=【经验·内部】：AI 视频重生成失败率无公开统计，内部预算经验值，批4 核验 2026-10-31）
- **6 积分/秒恒定**：4s=24、5s=30、10s=60（报价返回 `maxCredits`，confirmable 报价不扣分）
- **生成时长下限 4s**（`--duration` min=4）：分镜 2–3s 的快切镜必须按 4s 出、剪辑裁短——计费按 `max(4, 镜时长)` 估
- 上限 15s/次（step 1）；分镜 >10s 或「分两段/链式拼接」镜按多段生成，每段独立最短 4s
- **Dreamina Web 端能力（官方教程）**：Seedance 2.5 单次最长 30s；**extended generation 5–180s** 模式；**Multiframes 工具 ≤10 参考帧、每段 0–8s**【官方：dreamina.capcut.com/seedance/how-to-use-seedance-2-5，批1 ③/④】
- **素材侧两条（volcengine 图片生成 API）**：`watermark` 参数**默认 true**（右下角「AI 生成」水印）→ 出图素材必须显式传 **false**；`response_format=url` 的下载链接 **24 小时失效**，生成后立即转存入库（同 SiliconFlow 行 24h 口径）【官方：volcengine 图片生成 API 文档，批2 H2/H3】。素材关水印≠成品免标识——发布成品的显式标识义务见 `hard-gates.md` 第 10 节
- 计费实测口径（实测项目口径，2026-10-29）：2310 镜成片 11166s → 计费约 11719s ≈ **70314 积分全剧**；每集 516–780 积分（均 ~703）；613 积分 ≈ 0.87 集
- 出片流程三步门：`node create video`（不触发）→ `node quote`（免费预估）→ `node confirm`+`node run`（花钱门，超 ceiling 拒跑）
- 素材挂载：`resource upload` 登记 → `node create image --import-kind local_upload --resource-id` 上画布（不生成不扣分）；删除三步 `node delete` → `node delete confirm`（签 token）→ `node delete --delete-token`
- **成片时长=durationSeconds 精确对时（2026-11-05 ffprobe 实测）**：成片=请求时长（+0.06s 容器尾）；指令时间码只是节奏指引，覆盖超出部分被模型压缩/砍掉——分镜时间轴总长必须对上 `--duration`（prompt_selfcheck ⑦ 机检），详见 storyboard-director references/live-action-instruction-spec.md「时间轴对时」
- **<4s 快切镜出片口径（2026-10-29）**：生成 4s（按 4s 计费 24 积分），合成时用时间轴节点毫秒级裁剪 `--clip node_xxx,trim=<起点>-<正长度毫秒>`（支持 speed/volume/muted，音频轨 `--audio-clip start=` 对位）——**无需手动剪，按分镜表时长脚本化生成 clip 参数**；提示词把关键动作放前段。备选：resource download 后本地 ffmpeg 裁
- CLI 能力面 ↔ 界面工具映射：文本/图片/视频/音频(tts+music)/时间线/主体(element: 主素材+辅助+音色)/资产库/上传全部可 CLI 调用；**「导演工具箱/导演台」(Beta 虚拟导演) 为界面专属，CLI 契约无对应命令**

## 三、使用规则

1. **每个剧本/项目声明目标后端**（Notion 项目页或项目配置里写明，默认 `即梦/Seedance`），全流程统一，不混用
2. **切换后端时**：分镜创作按该后端方言重校提示词（长度/分段/参考图语义），素材创作按该后端通道写负面段（见 style-library 通道差异表）；通用核心不动
3. **工具前提检查**：走自动化出片前，确认该后端的报价（花钱门对接）、生成、验真三个工具/接口都可用；**任一缺失 = 该后端只能走手动路径**（skill 产出提示词文本，人工贴到平台，人工登记结果）
4. **花钱门与验真各按后端对接**：dreamina 用 `credit_gate.quote/run` + `submission.resources`；其他后端用其报价接口换算积分成本、用其任务查询验真——「报价→用户批→跑」「只认提交后新产物」两条铁律**后端无关，永远有效**
5. 新后端接入：在本表加一行（方言四列填齐）即可，skill 文档无需改动

## 四、命名口径

- skill 定位一律写「虚拟导演 + 视频提示词工程师（后端可插拔）」，不写死具体平台
- 触发词保留「即梦/Seedance」等平台词（用户提到平台名要能唤起 skill），但产出按目标后端方言
