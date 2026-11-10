---
name: shot-qa
description: 漫剧/短剧出片检查（出图/出视频前最终质检关）——先检查再花钱，顺序唯一：预检（分镜剧情校验：分镜↔剧本逐字对账、转场交代、品牌三层扫、违禁词、每镜≥250字、看点钩子句号收尾；素材校验预跑：资产挂载齐、ref 格式、节点 success；Notion 状态、规格复核）→ quote 报价 → 用户批 → run → 验真（submission.resources 只认新资源）→ 输出 LOCKED 检查报告。
---

# shot-qa（出片检查 · 三道闸）

五个 skill 流水线的最后一关：在积分花出去之前做最终质检。消费上游全部产出——
剧本条目（`novel-to-drama` / `idea-to-drama`）、分镜块（`storyboard-director`）、assets.json（`character-studio` / `scene-studio`），
按 `shared/output-formats.md` 第 4 节 LOCKED 契约输出检查报告；**三闸全过才准出片**，任一 FAIL 打回对应环节重做。

参考文件（规则引用，不复述全文）：

- `shared/output-formats.md` —— LOCKED 字段契约（第 2 节分镜块 / 第 3 节 assets.json / 第 4 节检查报告）
- `shared/hard-gates.md` / `shared/lessons.md` —— 硬闸总纲与历史翻车点
- `tools/credit_gate.py` —— 花钱门：`quote(cmd)` 报价 / `run(cmd, approved_by, max_credits)` 批准后执行
- `tools/brand_scan.py` —— 品牌植入扫描（`scan_shot(画面, 台词旁白弹幕)` / `scan_text`）
- `tools/prompt_selfcheck.py` —— 违禁废话词与规格机检
- `tools/pre_gen_gate.py` —— 五道硬闸批量预检（分镜细节/素材关联/剧情核验/场景纯净/Notion 先行）；剧目配置外置（`--config`，模板 `tools/pre_gen_gate_config.example.json`）
- `tools/notion_mcp_client.py` —— Notion MCP HTTP 客户端（查生成状态、取 submission.resources 验真）
- `references/three-gates.md` —— 三道闸逐项操作细节与检查报告填写模板

## 何时使用

- 出图 / 出视频前的最终检查——全过才许经花钱门花积分生成。
- 用户要求「出片检查 / 检查报告 / 过闸 / QA / 能不能出片」。
- 生成前的报价与批准流程（价格闸：账单怎么报、批文怎么记）。
- 生成完成后的结果验真（submission.resources 只认新资源）。
- 批量生成前的五道硬闸预检（`tools/pre_gen_gate.py`）。

## 流程

**执行顺序唯一，任何环节不得调换**（「先检查再花钱」：内容有问题的镜连账单都不该出）：

**预检（逐字 / 转场 / 品牌 / 违禁 / ≥250 字 / 挂载 / 格式 / Notion 状态 / 规格复核）→ quote 报价 → 用户批 → run → 验真 → 检查报告 → 交付前 AI 标识检查**

**所有内容检查必须在报价之前完成**（= 闸 2 全部 + 闸 3 预跑部分）；验真是 run 之后的唯一后置检查。任一 FAIL 即停，打回对应环节（分镜回 `storyboard-director`、素材回 `character-studio` / `scene-studio`、剧本回剧本 skill）。

### 预检（全部内容检查——报价之前逐项过完）

#### 闸 2：分镜剧情校验（逐项，方法见 `references/three-gates.md`）

1. **逐字**：分镜块 ↔ 剧本/Notion 原始指令逐字一致（SHA-256 级对账，零压缩搬运）；压缩/改写/拼装/加删标注头 = FAIL。
2. **转场**：转场交代齐——时间 + 地点 + 转场过渡句三件套（明写空间延续，不硬切）。转场点判定：相邻镜场景标签变化（细节见 three-gates.md）。
3. **品牌**：`brand_scan` 三层扫——画面/语音走 `scan_shot(画面, 台词旁白弹幕)`，字幕层另跑 `scan_text(字幕)`；命中即打回，禁止化名绕过（`shared/hard-gates.md` 第 6 节）。
4. **违禁**：违禁废话词走 `prompt_selfcheck.check(prompt, refs)`（4K/8K/杰作/超清晰/大师作/wallpaper）；每镜细节 ≥250 字保底；剧本「本集看点 / 结尾钩子」以**句号收尾**且在镜内有落点（可跑 `tools/pre_gen_gate.py` 核验，剧目配置见 `tools/pre_gen_gate_config.example.json`）。内容违禁（惊悚/微恐/血腥等）扫描范围=画面/台词/旁白/字幕/**标题/话题/弹幕**（标题同受管控），判定用**效果标准**（是否引发惊恐/焦虑/厌恶/恶心），官方条款与禁点词表见 `shared/hard-gates.md` 第 11 节【官方：细则 62 条、视频号 5.5.1/5.13.1、快手第四章二】。

#### 闸 3：素材校验 · 预跑部分（挂载 / 格式）

1. **挂载**：每镜该挂的人物/场景资产挂齐——露脸角色全挂（含对手戏，`shared/lessons.md` 第 13 条）、场景必挂；对照分镜块 `素材映射[]` 与 assets.json 审查（见 three-gates.md 挂载矩阵审查）。
2. **格式**：ref ID 格式 `node_[a-z0-9]{10}`，节点存在且状态 success；场景图必须纯空镜（有人场景不能用于出视频）。

#### Notion 状态 + 规格复核

- **Notion 状态 = 「生成中」**（用户批准）才许进入花钱门（`shared/hard-gates.md` 第 2 节）。
- **规格复核**（`shared/hard-gates.md` 第 8 节）：单次 ≤15s 自动分段 / 中文提示词 ≤500 字 / 每时间片一个动作一个运镜 / 情绪可视化 / 无废话词。

### 闸 1：价格闸（花钱门｜预检全过才许报价）

1. **报价**：`tools/credit_gate.py` 的 `quote(cmd)` 逐镜报价（单价 × 数量），账单（逐项明细 + 总价上限）发给用户；按**实估上限**报，留档位差余量（quote ≠ run，`shared/lessons.md` 第 6 条）。
2. **用户批**：拿到用户**明确批准**（记录批准人 + 批准上限）才许执行。素材审查过 ≠ 可以花钱。
3. **跑**：批准后 `run(cmd, approved_by, max_credits)`——`approved_by` 为假值/空白直接 `PermissionError`；执行时独占 `--credit-ceiling`（预置值一律剥离）。**超账单必须重新获批**：支出逼近或超出已批上限立即停下重新报价、重新批，禁止拿旧批文硬跑。

职责边界：shot-qa 只做检查与报价，不亲自执行生成；执行由各生成 skill 经花钱门直调 dreamina-canvas（`shared/hard-gates.md` 第 1 节；出片执行=自动为主，手动贴即梦仅备选路径）。

### 闸 3：素材校验 · 跑后部分（验真）

**验真**：生成后只认**提交时刻之后的新 resource**——看 `submission.resources`，`createdAt` 必须晚于本次提交时间戳；历史 success 资源一律不得当结果汇报（`shared/lessons.md` 第 7 条）；验真结果自动回填 Notion。

### 出检查报告

按 `shared/output-formats.md` 第 4 节 LOCKED 字段输出检查报告（填写模板见 `references/three-gates.md`）。
**三闸全过才准出片**；任一项 FAIL 打回对应环节重做，禁止带病出片。

批量场景可先跑五道硬闸预检（剧目配置外置：纯净空镜白名单 / 语境关键词 / 角色简称，模板 `tools/pre_gen_gate_config.example.json`，默认读 `./pre_gen_gate_config.json`）：

```bash
python3 -I tools/pre_gen_gate.py <episode_matrix.json> <episode_script.md> <novel_glob> [--config 剧目配置.json]
```

（G1 分镜细节 / G2 素材关联 / G3 剧情核验 / G4 场景纯净 / G5 Notion 先行，任一 FAIL 拒绝生成。）

### 交付前检查（AI 标识 · 法定义务）

成片验真通过后、**交付/发布前**逐项过 AI 标识三义务（`shared/hard-gates.md` 第 10 节，官方最高优先级——《人工智能生成合成内容标识办法》2025-09-01 施行 + 视频号 6.4）：

1. **显式标识**：视频起始画面 + 播放周边有显著「AI 生成」提示；导出/下载文件含显式标识。
2. **隐式标识**：文件元数据嵌生成属性/服务提供者/内容编号。
3. **发布主动声明**：发布方主动声明 + 使用平台标识功能；无删除/篡改/伪造/隐匿标识。

任一不过 = 拒绝交付/发布。素材层关水印（`watermark=false`）≠ 成品免标识。

## 硬闸与自检

- **一枪一停**：一次生成只干一件事，出完验完再开下一枪。
- **原节点重跑**：重试在原节点/原指令上重跑，不另起炉灶换指令。
- **重制不夹带**：重制只重制目标产物，禁止夹带改动其他镜/其他资产的生成。
- **验真只认新资源**：submission.resources + createdAt 晚于提交；禁止抓节点旧快照交差。
- **Notion 唯一控制面**：生成状态 =「生成中」（用户批准）才允许出图/出视频，禁止绕过 Notion 审核直接调生成（`shared/hard-gates.md` 第 2 节）；状态与资源查询走 `tools/notion_mcp_client.py`。
- **花钱门零容忍**：未经批准烧积分 = 零容忍（`shared/hard-gates.md` 第 1 节）；价格闸不过，其余两闸结果再好也不得出片。
- **零压缩铁律**：出片指令逐字搬运，SHA-256 校验一致（`shared/hard-gates.md` 第 3 节）。
- **品牌三层禁 + 违禁词零容忍**：画面/语音/字幕都禁，命中即打回（`shared/hard-gates.md` 零容忍清单）。

## 产出与格式

- **产出**：检查报告，字段名逐字引用 `shared/output-formats.md` 第 4 节 LOCKED 契约，禁止改名、别名、增删字段：

  ```
  检查报告{
    价格闸{报价, 批准},
    剧情校验{逐字, 转场, 品牌, 违禁},
    素材校验{挂载, 格式, 验真}
  }
  ```

- 每项写「过 / FAIL + 一句话证据」；FAIL 项写明打回哪个环节、改什么（模板见 `references/three-gates.md`）。
- 全过 → 放行出片（经花钱门执行）；有 FAIL → 打回重做，禁止带病出片。
- **交付清单**（交付/发布前，LOCKED 检查报告之外的法定义务附加项，`shared/hard-gates.md` 第 10 节）：

  ```
  交付清单{
    AI 标识{显式: 起始画面+播放周边, 隐式: 元数据, 发布主动声明}
  }
  ```

  每项写「过 / FAIL + 证据」；任一 FAIL 拒绝交付/发布。
- 下游衔接：检查报告随该集产出归档；Notion 数据表同步检查报告字段（`tools/notion_mcp_client.py`）。
