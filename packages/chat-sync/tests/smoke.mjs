/**
 * End-to-end smoke test: fake home with one session per source, real HTTP
 * server mounting the route family, SSE live-push on file append.
 *
 * Run: node tests/smoke.mjs
 */
import { mkdirSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatSources } from "../lib/sources.js";
import { makeRoutes } from "../lib/routes.js";

const home = join(tmpdir(), "dcs-smoke-" + Date.now());
const claudeFile = join(home, ".claude/projects/-tmp-fakeproj/11111111-2222-3333-4444-555555555555.jsonl");
const codexFile = join(home, ".codex/sessions/2026/01/01/rollout-2026-01-01T00-00-00-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.jsonl");
const cursorId = "99999999-8888-7777-6666-555555555555";
const cursorFile = join(home, ".cursor/projects/-tmp-fake/agent-transcripts/" + cursorId + "/" + cursorId + ".jsonl");

mkdirSync(join(home, ".claude/projects/-tmp-fakeproj"), { recursive: true });
mkdirSync(join(home, ".codex/sessions/2026/01/01"), { recursive: true });
mkdirSync(join(home, ".cursor/projects/-tmp-fake/agent-transcripts/" + cursorId), { recursive: true });

writeFileSync(claudeFile, [
  JSON.stringify({ type: "ai-title", aiTitle: "冒烟测试会话", sessionId: "11111111-2222-3333-4444-555555555555" }),
  JSON.stringify({ type: "user", cwd: "/tmp/fakeproj", timestamp: "2026-01-01T00:00:01.000Z", message: { role: "user", content: "帮我看看这个项目" } }),
  JSON.stringify({ type: "assistant", timestamp: "2026-01-01T00:00:02.000Z", message: { role: "assistant", model: "test-model", content: [{ type: "text", text: "好的，先浏览一下。" }, { type: "tool_use", name: "Read", input: { file_path: "/tmp/fakeproj/a.ts" } }] } }),
  JSON.stringify({ type: "user", timestamp: "2026-01-01T00:00:03.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "file contents here" }] } }),
].join("\n") + "\n");

writeFileSync(codexFile, [
  JSON.stringify({ timestamp: "2026-01-01T00:00:00.000Z", type: "session_meta", payload: { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", timestamp: "2026-01-01T00:00:00.000Z", cwd: "/tmp/fakeproj" } }),
  JSON.stringify({ timestamp: "2026-01-01T00:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "跑一下测试" }] } }),
  JSON.stringify({ timestamp: "2026-01-01T00:00:02.000Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "测试全部通过。" }] } }),
].join("\n") + "\n");

writeFileSync(cursorFile, [
  JSON.stringify({ role: "user", message: { content: [{ type: "text", text: "<timestamp>Friday, Jan 1, 2026, 8:00 AM (UTC+8)</timestamp>\n<user_query>\n修复日历视图\n</user_query>" }] } }),
  JSON.stringify({ role: "assistant", message: { content: [{ type: "text", text: "我来检查日历组件。" }, { type: "tool_use", name: "Shell", input: { command: "ls /tmp/fake/src" } }] } }),
  JSON.stringify({ type: "turn_ended", status: "success" }),
].join("\n") + "\n");

const sources = new ChatSources({ home });
const engine = makeRoutes({ sources, config: { watch: true, pollFallbackMs: 0, debounceMs: 300 } });
engine.start();

const byPath = new Map(engine.routes.map((r) => [r.path, r]));
const server = createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  const route = byPath.get(path);
  if (route) return route.handler(req, res);
  res.writeHead(404).end("no route");
});

const base = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve("http://127.0.0.1:" + server.address().port));
});

let failed = 0;
const check = (name, ok, extra) => {
  if (!ok) failed += 1;
  console.log((ok ? "PASS" : "FAIL") + " " + name + (extra ? " :: " + extra : ""));
};

// status
{
  const r = await (await fetch(base + "/api/dsh-chat-sync/status")).json();
  const total = r.sources.reduce((a, s) => a + s.count, 0);
  check("status: 3 sessions scanned", total === 3, JSON.stringify(r.sources.map((s) => s.count)) + " mode=" + r.mode);
}

// sessions
{
  const r = await (await fetch(base + "/api/dsh-chat-sync/sessions?limit=10")).json();
  check("sessions: 3 listed", r.total === 3);
  const claude = r.sessions.find((s) => s.source === "claude");
  check("claude title from ai-title", claude?.title === "冒烟测试会话", claude?.title);
  check("claude project from cwd", claude?.project === "fakeproj", claude?.project);
  const cursor = r.sessions.find((s) => s.source === "cursor");
  check("cursor title from user_query", cursor?.title === "修复日历视图", cursor?.title);
  const codex = r.sessions.find((s) => s.source === "codex");
  check("codex title from first user", codex?.title === "跑一下测试", codex?.title);
}

// session read (claude)
let claudeNext = 0;
{
  const r = await (await fetch(base + "/api/dsh-chat-sync/session?id=claude:11111111-2222-3333-4444-555555555555")).json();
  check("claude read: 3 messages", r.messages.length === 3, JSON.stringify(r.messages.map((m) => m.role)));
  const assistant = r.messages.find((m) => m.role === "assistant");
  check("claude tool_use captured", assistant?.toolUses?.[0]?.name === "Read");
  const tool = r.messages.find((m) => m.role === "tool");
  check("claude tool_result captured", tool?.text === "file contents here");
  claudeNext = r.next;
}

// SSE live push: subscribe, then append a claude line.
{
  const ac = new AbortController();
  const res = await fetch(base + "/api/dsh-chat-sync/events", { signal: ac.signal });
  check("sse: content-type", (res.headers.get("content-type") ?? "").includes("text/event-stream"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const frames = [];
  const pumpPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (data) frames.push(JSON.parse(data.slice(6)));
        }
      }
    } catch { /* aborted */ }
  })();

  // wait for hello frame
  await new Promise((resolve) => {
    const t = setInterval(() => {
      if (frames.some((f) => f.type === "hello")) { clearInterval(t); resolve(); }
    }, 50);
  });
  check("sse: hello frame", true);

  // trigger a live change
  await new Promise((r2) => setTimeout(r2, 250));
  appendFileSync(claudeFile, JSON.stringify({ type: "assistant", timestamp: "2026-01-01T00:00:09.000Z", message: { role: "assistant", model: "test-model", content: [{ type: "text", text: "追加的动态消息" }] } }) + "\n");

  // wait for a changed frame naming the claude session
  const got = await new Promise((resolve) => {
    const deadline = Date.now() + 8000;
    const t = setInterval(() => {
      const hit = frames.find((f) => f.type === "changed" && f.changed.some((c) => c.id.startsWith("claude:")));
      if (hit || Date.now() > deadline) { clearInterval(t); resolve(hit); }
    }, 100);
  });
  check("sse: changed frame after append", Boolean(got));
  ac.abort();
  await pumpPromise.catch(() => {});
}

// incremental read picks the appended message only
{
  const r = await (await fetch(base + "/api/dsh-chat-sync/session?id=claude:11111111-2222-3333-4444-555555555555&from=" + claudeNext)).json();
  check("incremental read: exactly 1 new message", r.messages.length === 1 && r.messages[0].text === "追加的动态消息", JSON.stringify(r.messages.map((m) => m.text)));
  check("incremental read: no reset", r.reset === false);
}

engine.dispose();
server.close();
rmSync(home, { recursive: true, force: true });
console.log(failed === 0 ? "SMOKE OK" : "SMOKE FAILED: " + failed);
process.exit(failed === 0 ? 0 : 1);
