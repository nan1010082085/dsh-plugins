/**
 * dsh-plugin-aigc-skill
 *
 * AIGC 漫剧创作技能套件（aigc-suite-skills）的 DSH 分发载体：
 * 从源仓库一次性取材 skills/（18 个 skill）+ shared/（规则词典）+ tools/（机器闸门），
 * 原样打入 npm 包，运行时只读包内路径。
 *
 * 边界（强制）：
 *   - 不写 ~/.claude/skills（与其他 Claude 安装零交叉）
 *   - 不读不写 ~/.workbuddy（不影响 WorkBuddy 专家团）
 *   - 与源仓库一次性取材、此后互不绑定（scripts/sync-skills.sh）
 *
 * 提供：
 *   - GET /api/dsh-aigc-skill/overview   技能清单 + 流水线 + 闸门状态
 *   - GET /api/dsh-aigc-skill/skill      单个 skill 全文（SKILL.md + references 清单）
 *   - GET /api/dsh-aigc-skill/file       shared/tools 文件内容（包内路径白名单）
 *   - GET/POST /api/dsh-aigc-skill/config 配置（默认风格等），存 ~/.config/aigc-skill/dsh-config.json
 */
import z from "@deepseek-ai/schemastery";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const name = "aigc-skill";
const inject = ["webServer"];

/** 包内资源根目录（lib/ 的上一层）。 */
const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS_DIR = path.join(PKG_ROOT, "skills");
const SHARED_DIR = path.join(PKG_ROOT, "shared");
const TOOLS_DIR = path.join(PKG_ROOT, "tools");
const HOME = os.homedir();

const Config = z.object({
  /** 总开关。false 时插件完全不注册路由。 */
  enabled: z.boolean().default(true),
  /** 一部剧锁定的默认风格 skill（style-*）。留空表示未锁定。 */
  defaultStyle: z.string().default(""),
});

/* ───────────────────────── 技能元数据 ───────────────────────── */

/** 流水线链路分组（2026-10-30 用户重排：剧本 → 素材 → 分镜）。 */
const CATEGORY_ORDER = ["script", "asset", "storyboard", "execute", "qa", "style"];
const CATEGORY_OF = {
  "novel-to-drama": "script",
  "idea-to-drama": "script",
  "character-studio": "asset",
  "scene-studio": "asset",
  "prop-studio": "asset",
  "storyboard-director": "storyboard",
  "video-producer": "execute",
  "shot-qa": "qa",
  "clip-review": "qa",
};

function categoryOf(skillName) {
  if (skillName.startsWith("style-")) return "style";
  return CATEGORY_OF[skillName] || "other";
}

/** 解析 SKILL.md 的 frontmatter（name/description）。 */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

function listSkillDirs() {
  try {
    return readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function skillMeta(dirName) {
  const skillMd = path.join(SKILLS_DIR, dirName, "SKILL.md");
  let description = "";
  let fmName = dirName;
  try {
    const fm = parseFrontmatter(readFileSync(skillMd, "utf8"));
    description = fm.description || "";
    fmName = fm.name || dirName;
  } catch {}
  let references = [];
  try {
    references = readdirSync(path.join(SKILLS_DIR, dirName, "references"))
      .filter((f) => f.endsWith(".md"))
      .sort();
  } catch {}
  return {
    name: fmName,
    dir: dirName,
    category: categoryOf(dirName),
    description,
    hasSkillMd: existsSync(skillMd),
    references,
  };
}

/** 机器闸门清单（tools/ 下对创作流程有门禁作用的脚本）。 */
const GATE_TOOLS = [
  { file: "pre_gen_gate.py", role: "五道硬闸预检（出图/出视频前强制）" },
  { file: "credit_gate.py", role: "花钱门（扣积分先报价再批准）" },
  { file: "brand_scan.py", role: "广告闸（品牌词扫描）" },
  { file: "prompt_selfcheck.py", role: "提示词自检" },
  { file: "shot_gate.py", role: "分镜闸" },
  { file: "prompt_compiler.py", role: "提示词编译（LoRA/触发词）" },
  { file: "skill_lint.py", role: "skill 结构 lint" },
  { file: "trust_audit.py", role: "信任审计" },
];

function listSharedFiles() {
  try {
    return readdirSync(SHARED_DIR)
      .filter((f) => statSync(path.join(SHARED_DIR, f)).isFile())
      .sort();
  } catch {
    return [];
  }
}

/* ───────────────────────── 小工具 ───────────────────────── */

function isIPv4Loopback(host) {
  return /^127(\.\d{1,3}){3}$/.test(host) || host === "0:0:0:0:0:0:0:1" || host === "::1";
}

function isLoopbackRequest(req) {
  if (!isIPv4Loopback(req.socket?.remoteAddress || "")) return false;
  const host = req.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL("http://" + host);
  } catch {
    return false;
  }
  const hn = hostUrl.hostname;
  if (hn !== "localhost" && hn !== "[::1]" && !isIPv4Loopback(hn)) return false;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  return true;
}

function writeJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "referrer-policy": "no-referrer" });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

/** 包内安全路径解析：限制在 skills/shared/tools 三棵目录内，拒绝穿越。 */
function resolvePackageFile(rel) {
  const roots = { skills: SKILLS_DIR, shared: SHARED_DIR, tools: TOOLS_DIR };
  const norm = path.normalize(String(rel || "")).replace(/^(\.\.[/\\])+/, "");
  const abs = path.resolve(PKG_ROOT, norm);
  const rootKey = path.relative(PKG_ROOT, abs).split(path.sep)[0];
  const root = roots[rootKey];
  if (!root) return null;
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

function readSavedConfig() {
  try {
    const file = path.join(HOME, ".config", "aigc-skill", "dsh-config.json");
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  return {};
}

function writeSavedConfig(next) {
  const file = path.join(HOME, ".config", "aigc-skill", "dsh-config.json");
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(next, null, 2));
  return file;
}

/* ───────────────────────── 插件主体 ───────────────────────── */

function apply(ctx, config) {
  const cfg = config && typeof config === "object" ? config : {};
  if (cfg.enabled === false) {
    ctx.logger.info("[aigc-skill] 插件已禁用");
    return;
  }

  const skills = listSkillDirs();
  ctx.logger.info(
    `[aigc-skill] 初始化 | 包内技能 ${skills.length} 个 | shared ${listSharedFiles().length} 个 | 闸门 ${GATE_TOOLS.filter((g) => existsSync(path.join(TOOLS_DIR, g.file))).length}/${GATE_TOOLS.length} | 来源=aigc-suite-skills 一次性取材`,
  );
  ctx.logger.info("[aigc-skill] 边界：只读包内路径，不写 ~/.claude/skills，不读写 ~/.workbuddy");

  const routes = [
    {
      name: "aigc-skill:overview",
      path: "/api/dsh-aigc-skill/overview",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: "loopback only" });
        if (req.method !== "GET") return writeJson(res, 405, { error: "Method Not Allowed" });
        try {
          const saved = readSavedConfig();
          const metas = listSkillDirs().map(skillMeta);
          const byCategory = {};
          for (const cat of CATEGORY_ORDER) byCategory[cat] = [];
          for (const m of metas) (byCategory[m.category] ||= []).push(m);
          writeJson(res, 200, {
            pipeline: ["script", "asset", "storyboard", "execute", "qa"],
            categoryOrder: CATEGORY_ORDER,
            skills: byCategory,
            total: metas.length,
            shared: listSharedFiles(),
            gates: GATE_TOOLS.map((g) => ({ ...g, available: existsSync(path.join(TOOLS_DIR, g.file)) })),
            defaultStyle: saved.defaultStyle || cfg.defaultStyle || "",
          });
        } catch (err) {
          writeJson(res, 500, { error: err.message });
        }
      },
    },
    {
      name: "aigc-skill:skill",
      path: "/api/dsh-aigc-skill/skill",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: "loopback only" });
        if (req.method !== "GET") return writeJson(res, 405, { error: "Method Not Allowed" });
        const url = new URL(req.url ?? "/", "http://localhost");
        const dir = url.searchParams.get("name") || "";
        if (!/^[a-z0-9][a-z0-9-]*$/.test(dir)) return writeJson(res, 400, { error: "invalid skill name" });
        const skillMd = path.join(SKILLS_DIR, dir, "SKILL.md");
        if (!existsSync(skillMd)) return writeJson(res, 404, { error: "skill not found: " + dir });
        try {
          const meta = skillMeta(dir);
          writeJson(res, 200, { ...meta, content: readFileSync(skillMd, "utf8") });
        } catch (err) {
          writeJson(res, 500, { error: err.message });
        }
      },
    },
    {
      name: "aigc-skill:file",
      path: "/api/dsh-aigc-skill/file",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: "loopback only" });
        if (req.method !== "GET") return writeJson(res, 405, { error: "Method Not Allowed" });
        const url = new URL(req.url ?? "/", "http://localhost");
        const rel = url.searchParams.get("path") || "";
        const abs = resolvePackageFile(rel);
        if (!abs) return writeJson(res, 404, { error: "file not found: " + rel });
        try {
          writeJson(res, 200, { path: path.relative(PKG_ROOT, abs), content: readFileSync(abs, "utf8") });
        } catch (err) {
          writeJson(res, 500, { error: err.message });
        }
      },
    },
    {
      name: "aigc-skill:config",
      path: "/api/dsh-aigc-skill/config",
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return writeJson(res, 403, { error: "loopback only" });
        if (req.method === "GET") {
          const saved = readSavedConfig();
          writeJson(res, 200, {
            enabled: saved.enabled ?? true,
            defaultStyle: saved.defaultStyle || cfg.defaultStyle || "",
          });
          return;
        }
        if (req.method === "POST") {
          try {
            const raw = await readBody(req);
            const prev = readSavedConfig();
            const next = { ...prev };
            if (typeof raw.enabled === "boolean") next.enabled = raw.enabled;
            if (typeof raw.defaultStyle === "string") next.defaultStyle = raw.defaultStyle;
            const file = writeSavedConfig(next);
            ctx.logger.info(`[aigc-skill] 配置已保存到 ${file}`);
            writeJson(res, 200, { success: true, message: "配置已保存" });
          } catch (err) {
            writeJson(res, 500, { error: err.message });
          }
          return;
        }
        writeJson(res, 405, { error: "Method Not Allowed" });
      },
    },
  ];

  const disposers = routes.map((route) => ctx.webServer.register(route));
  ctx.logger.info(`[aigc-skill] 路由已注册 ${routes.length} 条`);

  return () => {
    for (const dispose of disposers) {
      try {
        dispose && dispose();
      } catch {}
    }
    ctx.logger.info("[aigc-skill] 卸载完成");
  };
}

export { Config, apply, inject, name };
