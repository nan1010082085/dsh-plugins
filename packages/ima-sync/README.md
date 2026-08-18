# dsh-plugin-ima-sync

DSH（DeepSeek Harness）插件：**把 DSH 的对话进度自动上传到腾讯 IMA**（ima 笔记 + Work 知识库）。

灵感与行为对齐 Claude Code 的 ima 工作流：每轮对话结束自动生成一条进度记录，按天聚合到 `[项目名] YYYY-MM-DD` 笔记，可关联 IMA Work 知识库。

## 功能

| 触发时机 | 行为 |
| --- | --- |
| 每轮对话结束（`turn/end`） | 生成该轮进度记录并上传：用户输入、工具调用统计、todo 任务进度、回复摘要 |
| 会话销毁（`agent/disposed`） | 生成整场会话总结并上传（轮次列表 + 每轮摘要） |
| 手动 `/ima-upload` | 在 Web 输入框发送 `/ima-upload` 立即上传当前会话进度 |

只处理顶层会话（子代理会话不重复上报）；上传全部 fire-and-forget、按会话串行排队，失败仅记日志，绝不影响对话。

## 工作原理

- 监听 `session/event`（`turn/start` / `user/message` / `tool/call` / `assistant/message` / `todo/write` / `turn/end`）逐轮累积会话状态
- 监听 `agent/disposed` 生成会话总结
- 上传内容按天聚合到 IMA 每日笔记：`# [项目名] YYYY-MM-DD`，每轮一条 `### 轮次 #N`
- **上传通道**：优先调用本机 `~/.local/bin/ima-upload` 脚本（复用项目映射 `~/.config/ima/projects.json` 与每日笔记缓存 `~/.cache/ima/daily-notes`）；脚本不存在时自动退化为直接调用 IMA OpenAPI（`list_note` → `import_doc`/`append_doc` → `add_knowledge`），行为一致

## 安装

```sh
# 使用 dsh plugin 安装（推荐）
dsh plugin --profile web add dsh-plugin-ima-sync

# 重启 dsh web 生效
```

`dsh plugin` 会自动把声明了 `dsh.bundle` 的包追加到 profile 的 `dsh.profile.bundles`，无需手动改清单。

## 配置你自己的 IMA 凭证

> ⚠️ 本插件**不内置任何密钥**。`clientId` / `apiKey` / `workKbId` 均为配置项，请填入你自己的腾讯 IMA OpenAPI 凭证（获取方式见 [IMA 开放接口](https://ima.qq.com/agent-interface)）。

凭证按以下优先级解析（四者任一即可）：

1. **手动配置覆盖**（最高优先级）：在配置中使用 `manualOverride` 字段，设置后将忽略环境变量和本地文件

2. **profile 补丁配置**（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
# 方式1：直接配置（推荐简单使用）
- id: ima-sync
  config:
    enabled: true
    clientId: <your-ima-openapi-client-id>
    apiKey: <your-ima-openapi-api-key>
    workKbId: <your-ima-work-knowledge-base-id>   # 全局默认知识库 ID
    # 项目级别的知识库映射（可选）
    # projectKnowledgeBases:
    #   my-project: <project-specific-kb-id>
    #   another-project: <another-kb-id>
    # triggerOnTurnEnd: true
    # triggerOnSessionEnd: true
    # imaUploadBin: ''        # 默认 ~/.local/bin/ima-upload；留空且脚本不存在时走直接 API
    # projectsFile: ''        # 默认 ~/.config/ima/projects.json
    # cacheDir: ''            # 默认 ~/.cache/ima/daily-notes
    # defaultProject: ''      # cwd 未命中映射时的兜底项目名
    # maxPromptLength: 300
    # maxDetailLength: 20000
    # timeoutMs: 120000

# 方式2：使用手动配置覆盖（可覆盖环境变量和本地文件）
- id: ima-sync
  config:
    enabled: true
    manualOverride:
      clientId: <your-ima-openapi-client-id>
      apiKey: <your-ima-openapi-api-key>
      workKbId: <your-ima-work-knowledge-base-id>
```

3. **环境变量**：`IMA_OPENAPI_CLIENTID` / `IMA_OPENAPI_APIKEY`

4. **本地文件**（本机默认，与 Claude Code 的 ima MCP 共用）：`~/.config/ima/client_id` 与 `~/.config/ima/api_key`

> 也支持把 `clientId` / `apiKey` 用 `!!js process.env.XXX` 表达式注入（见 dsh loader 的 `!!js` 约定）。


## 可配置项

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关 |
| `triggerOnTurnEnd` | `true` | 每轮结束上传进度 |
| `triggerOnSessionEnd` | `true` | 会话销毁时上传总结 |
| `mode` | `project+date` | 笔记模式：`project+date`（按项目+日期分笔记）或 `daily`（每日日报，所有项目合并） |
| `clientId` / `apiKey` | 空（读环境变量/本地文件） | IMA OpenAPI 凭证 |
| `workKbId` | 空 | IMA Work 知识库 ID（全局默认），留空不关联知识库 |
| `projectKnowledgeBases` | 空对象 | 项目级别的知识库映射，key 为项目名，value 为知识库 ID |
| `manualOverride` | 空对象 | 手动配置覆盖，设置后优先使用，忽略环境变量和本地文件 |
| `imaUploadBin` | `~/.local/bin/ima-upload` | 本机上传脚本路径 |
| `projectsFile` | `~/.config/ima/projects.json` | 项目名映射文件 |
| `cacheDir` | `~/.cache/ima/daily-notes` | 每日笔记缓存目录 |
| `defaultProject` | 目录名 | cwd 未命中映射时的兜底项目名 |
| `maxPromptLength` | `300` | 用户输入截断长度 |
| `maxDetailLength` | `20000` | 详情截断长度 |
| `timeoutMs` | `120000` | 脚本调用超时 |

## 开发

```sh
node --check lib/index.js   # 语法检查
```

## License

MIT