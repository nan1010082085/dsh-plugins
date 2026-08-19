# dsh-mcp-sync 开发规则

## 插件概述

统一 MCP 管理：扫描各来源 → 同步到注册表 → 连接 → 注册工具。同步后的 MCP 是一等公民，可编辑、可删除、可直接调用。

## 核心架构

```
扫描来源 (Claude/Cursor/Codex/DSH)
         ↓
    统一注册表 (~/.dsh/mcp-registry.json)
         ↓
    MCP 连接管理器
         ↓
    DSH 工具注册 (mcp__<name>__<tool>)
         ↓
    模型直接调用
```

## 安装（强制）

```sh
dsh plugin --profile web add dsh-mcp-sync
```

## 发布流程

1. 修改 lib/ 下的文件
2. 更新 package.json 的 version
3. cd packages/mcp-sync && npm publish
4. dsh plugin --profile web add dsh-mcp-sync
5. 运行 dsh web 验证无报错

## 文件结构

| 文件 | 用途 |
|------|------|
| lib/index.js | 服务端主入口：同步、连接、工具注册 |
| lib/registry.js | **统一 MCP 注册表**（CRUD、导入） |
| lib/mcp-client.js | MCP 连接管理器（stdio/SSE/HTTP） |
| lib/mcp-tools.js | MCP 工具 → DSH 工具注册 |
| lib/sources.js | 数据源扫描（Claude/Cursor/Codex/DSH） |
| lib/routes.js | API 路由（注册表 CRUD + 连接管理） |
| lib/client.js | 客户端 UI |

## 注册表 vs 来源

- **来源** (sources.js): 只读扫描 Claude/Cursor/Codex/DSH 配置
- **注册表** (registry.js): 统一存储，可编辑、可删除
- **同步**: 来源 → 注册表（不覆盖已存在的）

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| /api/dsh-mcp-sync/registry | GET | 列出所有注册的 MCP |
| /api/dsh-mcp-sync/registry | POST | 添加/更新 MCP |
| /api/dsh-mcp-sync/registry | DELETE | 删除 MCP |
| /api/dsh-mcp-sync/sync | POST | 从来源同步到注册表 |
| /api/dsh-mcp-sync/sources | GET | 查看来源配置（只读） |
| /api/dsh-mcp-sync/connections | GET | 连接状态 |
| /api/dsh-mcp-sync/connect | POST | 连接服务器 |
| /api/dsh-mcp-sync/disconnect | POST | 断开连接 |
| /api/dsh-mcp-sync/tools | GET | 列出工具 |
| /api/dsh-mcp-sync/call | POST | 调用工具 |

## 依赖

- @modelcontextprotocol/sdk — MCP 协议客户端
- @deepseek-ai/dsh-tools — defineTool 工具定义
- @deepseek-ai/schemastery — 配置 schema
