/**
 * AutoImporter - 自动将本地 AI CLI 对话导入为 DSH 会话
 *
 * 扫描 Claude Code / Codex CLI / Cursor Agent 的对话，
 * 自动创建 DSH 会话并注入对话历史作为上下文。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** 用于包装 API 请求 */
function request(payload) {
  return {
    rpcId: `chat-sync-${randomUUID()}`,
    payload,
  };
}

export class AutoImporter {
  /**
   * @param {object} opts
   * @param {import("./sources.js").ChatSources} opts.sources
   * @param {object} opts.apiProxy - DSH API proxy (sessions, workspace)
   * @param {object} opts.logger - 日志器
   * @param {string} opts.importStateFile - 导入状态文件路径
   */
  constructor(opts) {
    this.sources = opts.sources;
    this.api = opts.apiProxy;
    this.logger = opts.logger;
    this.importStateFile = opts.importStateFile ?? ".chat-sync/imported.json";
    this.imported = new Map(); // sourceSessionId -> dshSessionId
    this.workspaceCache = new Map(); // path -> workspaceId
    this.running = false;
    this.timer = null;
  }

  /**
   * 启动自动导入
   */
  async start() {
    if (this.running) return;
    this.running = true;

    // 加载已导入状态
    this.loadState();

    // 预热：扫描并导入新对话
    await this.scanAndImport();

    this.logger.info("[chat-sync] 自动导入已启动");
  }

  /**
   * 停止自动导入
   */
  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 加载已导入状态
   */
  loadState() {
    try {
      if (existsSync(this.importStateFile)) {
        const data = JSON.parse(readFileSync(this.importStateFile, "utf8"));
        for (const [key, value] of Object.entries(data)) {
          this.imported.set(key, value);
        }
        this.logger.info(`[chat-sync] 加载导入状态: ${this.imported.size} 条记录`);
      }
    } catch (error) {
      this.logger.warn(`[chat-sync] 加载导入状态失败: ${error?.message}`);
    }
  }

  /**
   * 保存已导入状态
   */
  saveState() {
    try {
      const dir = dirname(this.importStateFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = Object.fromEntries(this.imported);
      writeFileSync(this.importStateFile, JSON.stringify(data, null, 2));
    } catch (error) {
      this.logger.warn(`[chat-sync] 保存导入状态失败: ${error?.message}`);
    }
  }

  /**
   * 扫描并导入新对话
   */
  async scanAndImport() {
    const sessions = this.sources.listSessions({ limit: 1000 });
    let imported = 0;

    for (const session of sessions.sessions) {
      // 跳过已导入的会话
      if (this.imported.has(session.id)) continue;

      // 只导入最近 24 小时内有更新的会话
      const age = Date.now() - session.updatedAt;
      if (age > 24 * 60 * 60 * 1000) continue;

      try {
        const dshSessionId = await this.importSession(session);
        if (dshSessionId) {
          this.imported.set(session.id, dshSessionId);
          imported++;
        }
      } catch (error) {
        this.logger.warn(`[chat-sync] 导入会话失败 ${session.id}: ${error?.message}`);
      }
    }

    if (imported > 0) {
      this.saveState();
      this.logger.info(`[chat-sync] 自动导入完成: 新增 ${imported} 个会话`);
    }
  }

  /**
   * 导入单个会话为 DSH 会话
   * @param {object} session - 源会话信息
   * @returns {Promise<string|null>} DSH 会话 ID
   */
  async importSession(session) {
    // 1. 确定工作区
    const workspaceId = await this.ensureWorkspace(session.cwd || session.project);

    // 2. 创建 DSH 会话
    const createResult = await this.api.sessions.create(request({
      ...workspaceId ? { workspaceId } : { cwd: session.cwd },
    }));

    if (!createResult.result.ok) {
      throw new Error(`创建会话失败: ${createResult.result.error?.message}`);
    }

    const dshSessionId = createResult.result.value.sessionId;

    // 3. 重命名会话
    const title = this.formatTitle(session);
    const renameResult = await this.api.sessions.rename(request({
      sessionId: dshSessionId,
      title,
    }));

    if (!renameResult.result.ok) {
      this.logger.warn(`[chat-sync] 重命名会话失败: ${renameResult.result.error?.message}`);
    }

    this.logger.info(`[chat-sync] 已导入会话: ${session.source}/${session.project} → ${dshSessionId}`);
    return dshSessionId;
  }

  /**
   * 确保工作区存在，不存在则创建
   * @param {string} cwd - 源会话的工作目录
   * @returns {Promise<string|null>} workspaceId
   */
  async ensureWorkspace(cwd) {
    if (!cwd) return null;

    // 检查缓存
    if (this.workspaceCache.has(cwd)) {
      return this.workspaceCache.get(cwd);
    }

    try {
      // 查询现有工作区
      const listResult = await this.api.workspace.list(request({}));
      if (listResult.result.ok) {
        const existing = listResult.result.value.items.find(
          (w) => w.path === cwd
        );
        if (existing) {
          this.workspaceCache.set(cwd, existing.workspaceId);
          return existing.workspaceId;
        }
      }

      // 创建新工作区（需要目录存在）
      if (!existsSync(cwd)) {
        mkdirSync(cwd, { recursive: true });
      }

      const createResult = await this.api.workspace.create(request({ path: cwd }));
      if (createResult.result.ok) {
        const workspaceId = createResult.result.value.workspaceId;
        this.workspaceCache.set(cwd, workspaceId);
        this.logger.info(`[chat-sync] 创建工作区: ${cwd} → ${workspaceId}`);
        return workspaceId;
      }

      this.logger.warn(`[chat-sync] 创建工作区失败: ${createResult.result.error?.message}`);
      return null;
    } catch (error) {
      this.logger.warn(`[chat-sync] 工作区操作失败: ${error?.message}`);
      return null;
    }
  }

  /**
   * 格式化会话标题
   * @param {object} session
   * @returns {string}
   */
  formatTitle(session) {
    const sourceLabel = {
      claude: "Claude",
      codex: "Codex",
      cursor: "Cursor",
    }[session.source] || session.source;

    const title = session.title || "未命名会话";
    return `[${sourceLabel}] ${title}`;
  }

}