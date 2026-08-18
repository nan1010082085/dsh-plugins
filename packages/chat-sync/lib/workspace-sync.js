/**
 * WorkspaceSync - 将本地 AI CLI 对话同步到工作区目录
 *
 * 监听 Claude Code / Codex CLI / Cursor Agent 的对话文件，
 * 自动复制到工作区目录，保持目录结构。
 */
import { existsSync, mkdirSync, copyFileSync, watch, statSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { homedir } from "node:os";

export class WorkspaceSync {
  /**
   * @param {object} opts
   * @param {import("./sources.js").ChatSources} opts.sources
   * @param {string} opts.workspaceDir - 目标工作区目录
   * @param {object} opts.logger - 日志器
   */
  constructor(opts) {
    this.sources = opts.sources;
    this.workspaceDir = opts.workspaceDir;
    this.logger = opts.logger;
    this.watchers = [];
    this.syncedFiles = new Set(); // 已同步的文件集合
    this.running = false;
  }

  /**
   * 启动同步
   */
  start() {
    if (this.running) return;
    this.running = true;

    // 确保工作区目录存在
    this.ensureWorkspaceDir();

    // 初始同步所有现有对话
    this.syncAll();

    // 监听各源目录
    this.watchSources();
  }

  /**
   * 停止同步
   */
  stop() {
    this.running = false;
    for (const w of this.watchers) {
      try { w.close(); } catch {}
    }
    this.watchers = [];
  }

  /**
   * 确保工作区目录存在
   */
  ensureWorkspaceDir() {
    if (!existsSync(this.workspaceDir)) {
      mkdirSync(this.workspaceDir, { recursive: true });
      this.logger.info(`[chat-sync] 创建工作区目录: ${this.workspaceDir}`);
    }
  }

  /**
   * 同步所有现有对话
   */
  syncAll() {
    const sessions = this.sources.listSessions({ limit: 1000 });
    let synced = 0;

    for (const session of sessions.sessions) {
      if (this.syncSession(session)) {
        synced++;
      }
    }

    this.logger.info(`[chat-sync] 初始同步完成 | synced=${synced} | total=${sessions.total}`);
  }

  /**
   * 同步单个会话
   * @param {object} session
   * @returns {boolean} 是否同步成功
   */
  syncSession(session) {
    try {
      const sourceFile = session.file;
      if (!sourceFile || !existsSync(sourceFile)) return false;

      // 构建目标路径: .chat-sync/<source>/<project>/<filename>
      const targetDir = join(this.workspaceDir, session.source, session.project);
      const targetFile = join(targetDir, basename(sourceFile));

      // 检查是否需要同步
      if (this.needsSync(sourceFile, targetFile)) {
        // 创建目录
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }

        // 复制文件
        copyFileSync(sourceFile, targetFile);
        this.syncedFiles.add(sourceFile);

        this.logger.debug(`[chat-sync] 同步: ${session.source}/${session.project}/${basename(sourceFile)}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(`[chat-sync] 同步失败: ${error?.message}`);
      return false;
    }
  }

  /**
   * 检查文件是否需要同步
   */
  needsSync(sourceFile, targetFile) {
    // 如果目标文件不存在，需要同步
    if (!existsSync(targetFile)) return true;

    try {
      const sourceStat = statSync(sourceFile);
      const targetStat = statSync(targetFile);

      // 如果源文件更新，需要同步
      return sourceStat.mtimeMs > targetStat.mtimeMs || sourceStat.size !== targetStat.size;
    } catch {
      return true;
    }
  }

  /**
   * 监听源目录
   */
  watchSources() {
    const home = homedir();
    const roots = [
      { id: "claude", path: join(home, ".claude", "projects") },
      { id: "codex", path: join(home, ".codex", "sessions") },
      { id: "cursor", path: join(home, ".cursor", "projects") },
    ];

    for (const root of roots) {
      if (!existsSync(root.path)) continue;

      try {
        const watcher = watch(root.path, { recursive: true }, (eventType, filename) => {
          if (!this.running) return;
          if (!filename || !filename.endsWith(".jsonl")) return;

          // 去抖处理
          this.scheduleSync();
        });

        watcher.on("error", (err) => {
          this.logger.warn(`[chat-sync] 监听 ${root.id} 失败: ${err.message}`);
        });

        this.watchers.push(watcher);
        this.logger.info(`[chat-sync] 开始监听 ${root.id}: ${root.path}`);
      } catch (error) {
        this.logger.warn(`[chat-sync] 无法监听 ${root.id}: ${error.message}`);
      }
    }
  }

  /**
   * 去抖同步
   */
  scheduleSync() {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(() => {
      this.syncAll();
    }, 500);
  }
}
