/**
 * dsh-plugin-ima-sync
 *
 * 将 DSH 会话的「对话进度」自动上传到腾讯 IMA（腾讯 ima 笔记 + Work 知识库）。
 *
 * 设计对齐本机 Claude Code 的 ima 工作流（~/.claude.json 的 ima MCP 配置、
 * ~/.local/bin/ima-upload 脚本、~/.config/ima/projects.json 项目映射、每日笔记缓存）：
 *   - 每个对话轮次结束（turn/end）后生成一条进度记录
 *   - 会话销毁（agent/disposed）时生成会话总结
 *   - 提供 /ima-upload 命令手动上传当前会话进度
 *   - 优先调用本机 ~/.local/bin/ima-upload（复用项目映射 + 每日笔记缓存 + 知识库关联），
 *     脚本不存在时退化为直接调用 IMA OpenAPI（同样按天聚合到 [项目] YYYY-MM-DD 笔记）。
 *
 * 零副作用设计：所有上传均 fire-and-forget 且串行排队，失败只记日志，不阻塞会话。
 */
import z from "@deepseek-ai/schemastery";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const name = "ima-sync";
const inject = [];

const Config = z.object({
  /** 总开关。false 时插件完全不注册监听。 */
  enabled: z.boolean().default(true),
  /** 每轮对话结束（turn/end）时上传一条进度记录。 */
  triggerOnTurnEnd: z.boolean().default(true),
  /** 会话销毁（agent/disposed）时上传一条会话总结。 */
  triggerOnSessionEnd: z.boolean().default(true),
  /** IMA OpenAPI Client ID。留空依次回退：环境变量 -> ~/.config/ima/client_id。 */
  clientId: z.string().default(""),
  /** IMA OpenAPI API Key。留空依次回退：环境变量 -> ~/.config/ima/api_key。 */
  apiKey: z.string().default(""),
  /** IMA Work 知识库 ID。留空则只创建/追加笔记，不关联知识库。 */
  workKbId: z.string().default(""),
  /** 本机 ima-upload 脚本路径。留空默认 ~/.local/bin/ima-upload；脚本不存在时走直接 API。 */
  imaUploadBin: z.string().default(""),
  /** 项目名映射文件（cwd -> 项目名）。留空默认 ~/.config/ima/projects.json。 */
  projectsFile: z.string().default(""),
  /** 每日笔记缓存目录。留空默认 ~/.cache/ima/daily-notes（与 Claude 脚本共用）。 */
  cacheDir: z.string().default(""),
  /** cwd 未命中项目映射时的兜底项目名。留空使用目录名。 */
  defaultProject: z.string().default(""),
  /** 用户输入在进度记录中的最大字符数。 */
  maxPromptLength: z.number().step(1).min(10).default(300),
  /** 详情（detail）最大字符数，防止单条记录过大。 */
  maxDetailLength: z.number().step(1).min(200).default(20000),
  /** ima-upload 脚本超时（毫秒）。 */
  timeoutMs: z.number().step(1).min(1000).default(120000),
});

const DEFAULT_BASE_URL = "https://ima.qq.com";
const HOME = os.homedir();

/* ───────────────────────── 小工具 ───────────────────────── */

function readTrimmed(file) {
  try {
    return readFileSync(file, "utf8").trim();
  } catch {
    return "";
  }
}

function resolveConfig(config) {
  const base = config && typeof config === "object" ? config : {};
  // 无论是否经过 schemastery 校验，都补齐默认值（对原始 config 也健壮）。
  return {
    enabled: base.enabled ?? true,
    triggerOnTurnEnd: base.triggerOnTurnEnd ?? true,
    triggerOnSessionEnd: base.triggerOnSessionEnd ?? true,
    clientId: base.clientId || process.env.IMA_OPENAPI_CLIENTID || process.env.IMA_CLIENT_ID || readTrimmed(path.join(HOME, ".config/ima/client_id")),
    apiKey: base.apiKey || process.env.IMA_OPENAPI_APIKEY || process.env.IMA_API_KEY || readTrimmed(path.join(HOME, ".config/ima/api_key")),
    workKbId: base.workKbId || "",
    imaUploadBin: base.imaUploadBin || path.join(HOME, ".local/bin/ima-upload"),
    projectsFile: base.projectsFile || path.join(HOME, ".config/ima/projects.json"),
    cacheDir: base.cacheDir || path.join(HOME, ".cache/ima/daily-notes"),
    defaultProject: base.defaultProject || "",
    maxPromptLength: base.maxPromptLength ?? 300,
    maxDetailLength: base.maxDetailLength ?? 20000,
    timeoutMs: base.timeoutMs ?? 120000,
  };
}

/** 最长路径前缀匹配 cwd -> 项目名（与 ~/.local/bin/ima-upload 的 lookup_project 一致）。 */
function resolveProjectName(cwd, projectsFile, fallback) {
  try {
    const map = JSON.parse(readFileSync(projectsFile, "utf8"));
    const matched = Object.entries(map)
      .filter(([key]) => cwd === key || cwd.startsWith(key.endsWith("/") ? key : key + "/"))
      .sort((a, b) => b[0].length - a[0].length);
    if (matched.length > 0) return matched[0][1];
  } catch {
    /* 映射文件缺失/损坏时走兜底 */
  }
  return fallback || (cwd ? path.basename(cwd) : "DSH");
}

/** 从消息 content blocks 提取纯文本。 */
function messageText(message) {
  if (!message || !Array.isArray(message.content)) return "";
  const parts = [];
  for (const block of message.content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
    else if (block.type === "tool-result" && Array.isArray(block.content)) {
      for (const inner of block.content) {
        if (inner && inner.type === "text" && typeof inner.text === "string") parts.push(inner.text);
      }
    }
  }
  return parts.join(" ").trim();
}

function oneLine(text) {
  return String(text).replace(/\s+/g, " ").trim();
}

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function localDate() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function localTime() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(now.getHours())}:${p(now.getMinutes())}`;
}

/** 仅处理顶层会话（子代理会话不重复上报）。 */
function isTopLevel(session) {
  const depth = session?.header?.delegationDepth;
  return depth == null || depth === 0;
}

function summarizeTools(tools) {
  const entries = [...tools.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "无工具调用";
  return entries.map(([n, c]) => `${n}×${c}`).join(", ");
}

function renderTodos(todos) {
  if (!todos || todos.length === 0) return "（无任务列表）";
  const counts = { pending: 0, in_progress: 0, completed: 0 };
  for (const t of todos) counts[t.status] = (counts[t.status] ?? 0) + 1;
  const lines = todos.map((t) => {
    const mark = t.status === "completed" ? "x" : t.status === "in_progress" ? "/" : " ";
    return `- [${mark}] ${t.content}`;
  });
  return `${counts.completed}/${todos.length} 完成` + "\n" + lines.join("\n");
}

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/* ───────────────────────── 上传通道 ───────────────────────── */

/** 调用本机 ima-upload 脚本（cwd 决定项目映射）。 */
function runImaUpload(bin, args, cwd, timeoutMs) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`ima-upload 失败：${err.message}${stderr ? "\n" + stderr.slice(0, 1000) : ""}`));
      else resolve(stdout);
    });
  });
}

/** 直接调用 IMA OpenAPI（无脚本时的退化路径）。 */
async function callIma(apiPath, body, creds) {
  const response = await fetch(`${DEFAULT_BASE_URL}/${apiPath}`, {
    method: "POST",
    headers: {
      "ima-openapi-clientid": creds.clientId,
      "ima-openapi-apikey": creds.apiKey,
      "ima-openapi-ctx": "dsh-plugin-ima-sync",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`IMA 返回非 JSON 响应：HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  if (!response.ok || (typeof parsed.code === "number" && parsed.code !== 0)) {
    throw new Error(`IMA API ${apiPath} 失败：${parsed.msg || parsed.code || response.status}`);
  }
  return parsed;
}

/** 分页查找今日最早一篇「[项目]」前缀笔记（与 ima-upload 的 find_today_note 一致）。 */
async function findTodayNote(prefix, todayStartMs, creds) {
  let cursor = "";
  for (let i = 0; i < 5; i++) {
    const resp = await callIma("openapi/note/v1/list_note", { cursor, limit: 20 }, creds);
    const list = resp.data?.note_book_list ?? [];
    const matches = list
      .filter((n) => String(n.title ?? "").startsWith(prefix))
      .filter((n) => Number(n.create_time ?? 0) >= todayStartMs)
      .sort((a, b) => Number(a.create_time ?? 0) - Number(b.create_time ?? 0));
    if (matches.length > 0) return matches[0].note_id ?? "";
    if (resp.data?.is_end === true) break;
    cursor = resp.data?.next_cursor ?? "";
    if (!cursor) break;
  }
  return "";
}

/** 直接 API 上传：找/建每日笔记 -> 追加或创建 -> 关联 Work 知识库。 */
async function uploadDirect({ creds, project, task, summary, detail, cacheDir, workKbId, date }) {
  const dailyTitle = `[${project}] ${date}`;
  const cacheKey = createHash("md5").update(`${project}_${date}\n`).digest("hex");
  const cacheFile = path.join(cacheDir, cacheKey);
  let noteId = "";
  let fromCache = false;
  if (existsSync(cacheFile)) {
    noteId = readFileSync(cacheFile, "utf8").trim();
    if (noteId) fromCache = true;
  }
  if (!noteId) {
    const todayStartMs = new Date(`${date}T00:00:00`).getTime();
    noteId = await findTodayNote(`[${project}]`, todayStartMs, creds);
    if (noteId) {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cacheFile, noteId);
      } catch {
        /* 缓存写入失败不影响上传 */
      }
    }
  }

  const appendContent = `\n\n### ${task}\n\n${summary}\n\n${detail}`;

  if (noteId) {
    try {
      await callIma("openapi/note/v1/append_doc", { note_id: noteId, content_format: 1, content: appendContent }, creds);
      return { noteId, created: false, via: "api" };
    } catch (err) {
      if (!fromCache) throw err;
      // 缓存笔记可能已被删：清缓存后按新笔记处理
      try {
        writeFileSync(cacheFile, "");
      } catch {
        /* ignore */
      }
      noteId = "";
    }
  }

  const fullContent = `# ${dailyTitle}\n\n- **项目**：${project}\n- **日期**：${date}\n\n---\n\n### ${task}\n\n${summary}\n\n${detail}`;
  const created = await callIma("openapi/note/v1/import_doc", { content_format: 1, content: fullContent }, creds);
  const newId = created.data?.note_id ?? "";
  if (!newId) throw new Error("IMA import_doc 未返回 note_id");
  try {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, newId);
  } catch {
    /* ignore */
  }
  if (workKbId) {
    try {
      await callIma("openapi/wiki/v1/add_knowledge", {
        media_type: 11,
        title: dailyTitle,
        knowledge_base_id: workKbId,
        note_info: { content_id: newId },
      }, creds);
    } catch (err) {
      /* 知识库关联失败不致命，笔记已创建 */
    }
  }
  return { noteId: newId, created: true, via: "api" };
}

/* ───────────────────────── 进度记录构建 ───────────────────────── */

/** 单轮进度记录。 */
function buildTurnRecord(state, reason, cfg) {
  const prompt = truncate(state.prompt || "（无用户输入）", cfg.maxPromptLength);
  const tools = summarizeTools(state.tools);
  const todos = renderTodos(state.todos);
  const reply = truncate(state.lastAssistant || "（无回复）", cfg.maxDetailLength);
  const reasonNote = reason && reason !== "success" ? `（结束原因：${reason}）` : "";
  const task = `轮次 #${state.turn}${reasonNote}：${oneLine(prompt).slice(0, 40)}`;
  const summary = `第 ${state.turn} 轮对话完成。工具调用：${tools}。任务进度：${oneLine(todos.split("\n")[0])}。`;
  const detail = [
    `### 轮次 #${state.turn} — ${localDate()} ${localTime()}${reasonNote}`,
    "",
    `**用户**：${prompt}`,
    "",
    `**工具调用**：${tools}`,
    "",
    `**任务列表**：`,
    todos,
    "",
    `**回复摘要**：`,
    reply,
  ].join("\n");
  return { task, summary, detail };
}

/** 会话总结（手动 /ima-upload 与会话结束时使用）。 */
function buildSessionDigest(session, cfg) {
  const turns = [];
  let current = null;
  for (const ev of session.events) {
    switch (ev.type) {
      case "turn/start":
        current = { turn: ev.data.turn, prompt: "", tools: new Map(), reply: "", reason: "" };
        turns.push(current);
        break;
      case "user/message":
        if (current && ev.data.source?.kind === "user" && !current.prompt) current.prompt = messageText(ev.data);
        break;
      case "tool/call":
        if (current && ev.data.turn === current.turn) bump(current.tools, ev.data.name);
        break;
      case "assistant/message":
        if (current && ev.data.turn === current.turn) current.reply = messageText(ev.data.message);
        break;
      case "turn/end":
        if (current && ev.data.turn === current.turn) current.reason = ev.data.reason;
        break;
    }
  }
  const sections = turns.map((t) => {
    const prompt = truncate(t.prompt || "（无用户输入）", cfg.maxPromptLength);
    const reply = truncate(t.reply || "（无回复）", cfg.maxDetailLength);
    const reasonNote = t.reason && t.reason !== "success" ? `（${t.reason}）` : "";
    return [
      `### 轮次 #${t.turn}${reasonNote}`,
      "",
      `**用户**：${prompt}`,
      "",
      `**工具调用**：${summarizeTools(t.tools)}`,
      "",
      `**回复摘要**：`,
      reply,
      "",
      "---",
    ].join("\n");
  });
  const totalTools = turns.reduce((acc, t) => acc + [...t.tools.values()].reduce((a, b) => a + b, 0), 0);
  const task = `会话总结（共 ${turns.length} 轮）`;
  const summary = `对话结束，共 ${turns.length} 轮，工具调用合计 ${totalTools} 次。`;
  const detail = turns.length === 0
    ? "（会话无已完成轮次）"
    : ["## 会话进度摘要", "", ...sections].join("\n");
  return { task, summary, detail };
}

/* ───────────────────────── 插件主体 ───────────────────────── */

function apply(ctx, config) {
  const cfg = resolveConfig(config);
  if (!cfg.enabled) return;

  if (!cfg.clientId || !cfg.apiKey) {
    ctx.logger.warn("[ima-sync] 未找到 IMA 凭证（clientId/apiKey），插件已禁用。可配置 clientId/apiKey，或写入 ~/.config/ima/client_id 与 ~/.config/ima/api_key。");
    return;
  }

  const log = (message) => ctx.logger.info(`[ima-sync] ${message}`);
  const warn = (message) => ctx.logger.warn(`[ima-sync] ${message}`);

  /** 每个会话的上传队列（串行，避免并发写同一篇笔记）。 */
  const queues = new Map();
  const enqueue = (sessionId, task) => {
    const prev = queues.get(sessionId) ?? Promise.resolve();
    const next = prev
      .then(task)
      .catch((err) => {
        warn(`上传失败：${err.message}`);
      });
    queues.set(sessionId, next);
  };

  /** 统一的「构建记录 -> 上传」入口。 */
  const uploadRecord = (session, record) => {
    const cwd = session?.header?.cwd || process.cwd();
    const project = resolveProjectName(cwd, cfg.projectsFile, cfg.defaultProject);
    return (async () => {
      if (cfg.imaUploadBin && existsSync(cfg.imaUploadBin)) {
        await runImaUpload(cfg.imaUploadBin, ["-t", record.task, "-s", record.summary, "-d", record.detail], cwd, cfg.timeoutMs);
        log(`已上传（脚本）→ ${project}：${oneLine(record.task)}`);
        return { via: "script", noteId: "" };
      }
      const date = localDate();
      const creds = { clientId: cfg.clientId, apiKey: cfg.apiKey };
      const res = await uploadDirect({
        creds,
        project,
        task: record.task,
        summary: record.summary,
        detail: record.detail,
        cacheDir: cfg.cacheDir,
        workKbId: cfg.workKbId,
        date,
      });
      log(`已上传（API）→ ${project}：${oneLine(record.task)} note_id=${res.noteId}`);
      return res;
    })();
  };

  /** 每会话实时轮次状态（turn/start 重置）。 */
  const states = new Map();
  const stateFor = (session) => {
    let s = states.get(session.id);
    if (!s) {
      s = { turn: 0, prompt: "", tools: new Map(), lastAssistant: "", todos: null, uploaded: new Set() };
      states.set(session.id, s);
    }
    return s;
  };

  ctx.on("session/event", (session, event) => {
    try {
      if (!isTopLevel(session)) return;
      const state = stateFor(session);
      switch (event.type) {
        case "turn/start": {
          state.turn = event.data.turn;
          state.prompt = "";
          state.tools = new Map();
          state.lastAssistant = "";
          state.todos = null;
          break;
        }
        case "user/message": {
          if (event.data.source?.kind === "user" && !state.prompt) {
            state.prompt = messageText(event.data);
          }
          break;
        }
        case "tool/call": {
          if (event.data.turn === state.turn) bump(state.tools, event.data.name);
          break;
        }
        case "assistant/message": {
          if (event.data.turn === state.turn) state.lastAssistant = messageText(event.data.message);
          break;
        }
        case "todo/write": {
          state.todos = event.data.todos;
          break;
        }
        case "turn/end": {
          if (cfg.triggerOnTurnEnd && !state.uploaded.has(event.data.turn)) {
            state.uploaded.add(event.data.turn);
            const record = buildTurnRecord(state, event.data.reason, cfg);
            enqueue(session.id, () => uploadRecord(session, record));
          }
          break;
        }
      }
    } catch (err) {
      warn(`处理会话事件出错：${err.message}`);
    }
  });

  ctx.on("agent/disposed", ({ agent }) => {
    try {
      if (!cfg.triggerOnSessionEnd) return;
      const session = agent?.session;
      if (!session || !isTopLevel(session)) return;
      const record = buildSessionDigest(session, cfg);
      enqueue(session.id, () => uploadRecord(session, record));
    } catch (err) {
      warn(`会话结束上传出错：${err.message}`);
    }
  });

  // /ima-upload 手动命令（可选服务，缺少 commands 时自动跳过）
  ctx.inject(["commands"], (child) => {
    child.commands.register({
      name: "ima-upload",
      description: "将当前会话的对话进度上传到 IMA",
      handler: async (invocation) => {
        try {
          const session = invocation.agent?.session;
          if (!session) return { kind: "error", text: "❌ 找不到当前会话。" };
          const record = buildSessionDigest(session, cfg);
          const res = await uploadRecord(session, record);
          const note = res.noteId ? `（note_id: ${res.noteId}）` : "";
          return { kind: "success", text: `✅ 已上传当前会话进度到 IMA ${note}` };
        } catch (err) {
          return { kind: "error", text: `❌ IMA 上传失败：${err.message}` };
        }
      },
    });
  });
}

export { Config, apply, inject, name };
