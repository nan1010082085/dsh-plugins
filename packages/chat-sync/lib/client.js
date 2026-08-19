/**
 * dsh-chat-sync - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-chat-sync/client.js and
 * materialized through window.__ModuleLoader__. Registers a tab in
 * dsh-better-sidebar showing local Claude Code / Codex CLI / Cursor Agent
 * conversations organized by source, with live-sync over SSE.
 */
window.__ModuleLoader__.load({
	id: "dsh-chat-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { useState, useEffect, useRef, useMemo, useCallback } = React;
		const h = React.createElement;

		/* ───────────── constants & helpers ───────────── */

		const API = {
			status: "/api/dsh-chat-sync/status",
			sessions: (params) => "/api/dsh-chat-sync/sessions?" + new URLSearchParams(params),
			session: (params) => "/api/dsh-chat-sync/session?" + new URLSearchParams(params),
			events: "/api/dsh-chat-sync/events",
		};

		const SOURCE_META = {
			claude: { label: "Claude Code", color: "#d97757", icon: "C" },
			codex: { label: "Codex CLI", color: "#10a37f", icon: "X" },
			cursor: { label: "Cursor Agent", color: "#3ea8ff", icon: "U" },
		};

		const SOURCES = ["claude", "codex", "cursor"];

		async function getJSON(url) {
			const res = await fetch(url, { headers: { accept: "application/json" } });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		function relTime(ts) {
			if (!ts) return "";
			const d = Date.now() - ts;
			if (d < 0) return "刚刚";
			if (d < 60e3) return "刚刚";
			if (d < 3600e3) return Math.floor(d / 60e3) + " 分钟前";
			if (d < 86400e3) return Math.floor(d / 3600e3) + " 小时前";
			if (d < 7 * 86400e3) return Math.floor(d / 86400e3) + " 天前";
			return new Date(ts).toLocaleDateString();
		}

		function fmtBytes(n) {
			if (!n && n !== 0) return "";
			if (n < 1024) return n + " B";
			if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
			return (n / 1048576).toFixed(1) + " MB";
		}

		function oneLine(s, n) {
			const t = String(s ?? "").replace(/\s+/g, " ").trim();
			return t.length > n ? t.slice(0, n - 1) + "…" : t;
		}

		/* ───────────── styles ───────────── */

		const CSS = [
			/* tree container */
			".dcs-tree { display: flex; flex-direction: column; height: 100%; font-family: var(--dsw-font-family); }",
			".dcs-toolbar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); flex: none; }",
			".dcs-search { flex: 1; height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 12px; outline: none; }",
			".dcs-search:focus { border-color: rgba(127,127,127,.4); }",
			".dcs-liveBtn { display: inline-flex; align-items: center; gap: 4px; border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 11px; padding: 2px 6px; border-radius: 4px; }",
			".dcs-liveBtn:hover { background: rgba(127,127,127,.1); }",
			".dcs-liveBtn[data-on='1'] { color: #34c759; }",
			".dcs-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }",

			/* source groups */
			".dcs-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }",
			".dcs-sourceGroup { margin-bottom: 2px; }",
			".dcs-sourceHead { display: flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; user-select: none; }",
			".dcs-sourceHead:hover { background: rgba(127,127,127,.06); }",
			".dcs-sourceArrow { width: 14px; height: 14px; color: var(--dsw-alias-label-secondary); transition: transform .15s; flex: none; }",
			".dcs-sourceArrow[data-open='1'] { transform: rotate(90deg); }",
			".dcs-sourceBadge { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 3px; color: #fff; flex: none; }",
			".dcs-sourceLabel { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); flex: 1; }",
			".dcs-sourceCount { font-size: 10px; color: var(--dsw-alias-label-secondary); flex: none; }",

			/* session rows */
			".dcs-sessionList { padding-left: 14px; }",
			".dcs-row { display: block; width: 100%; text-align: left; border: none; background: transparent; border-radius: 6px; padding: 6px 10px; cursor: pointer; color: inherit; margin: 1px 0; }",
			".dcs-row:hover { background: rgba(127,127,127,.08); }",
			".dcs-row[data-selected='1'] { background: rgba(62,132,255,.12); }",
			".dcs-rowTitle { font-size: 12px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }",
			".dcs-rowLive { width: 5px; height: 5px; border-radius: 50%; background: #34c759; flex: none; animation: dcsPulse 1.6s infinite; }",
			"@keyframes dcsPulse { 0%,100% { opacity: 1 } 50% { opacity: .3 } }",
			".dcs-rowMeta { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 2px; display: flex; gap: 6px; }",
			".dcs-rowProject { overflow: hidden; text-overflow: ellipsis; max-width: 60%; }",

			/* detail panel */
			".dcs-detail { display: flex; flex-direction: column; height: 100%; }",
			".dcs-detailHead { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); flex: none; }",
			".dcs-detailBack { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 2px; border-radius: 4px; }",
			".dcs-detailBack:hover { background: rgba(127,127,127,.1); }",
			".dcs-detailTitle { font-size: 12px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".dcs-detailMeta { font-size: 10px; color: var(--dsw-alias-label-secondary); flex: none; }",
			".dcs-msgs { flex: 1; overflow-y: auto; padding: 10px; }",
			".dcs-msg { margin-bottom: 8px; max-width: 95%; }",
			".dcs-msg[data-role='user'] { margin-left: auto; }",
			".dcs-bubble { border-radius: 8px; padding: 6px 10px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }",
			".dcs-msg[data-role='user'] .dcs-bubble { background: rgba(62,132,255,.12); border: 1px solid rgba(62,132,255,.2); }",
			".dcs-msg[data-role='assistant'] .dcs-bubble { background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); }",
			".dcs-msg[data-role='system'] .dcs-bubble, .dcs-msg[data-role='tool'] .dcs-bubble { background: transparent; border: 1px dashed rgba(127,127,127,.2); color: var(--dsw-alias-label-secondary); font-size: 11px; }",
			".dcs-msgTag { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-bottom: 2px; }",
			".dcs-tools { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }",
			".dcs-tool { font-size: 10px; background: rgba(127,127,127,.1); border: 1px solid rgba(127,127,127,.15); border-radius: 4px; padding: 1px 6px; color: var(--dsw-alias-label-secondary); }",
			".dcs-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }",
			".dcs-loading { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(127,127,127,.2); border-top-color: var(--dsw-alias-label-primary); border-radius: 50%; animation: dcsSpin .8s linear infinite; }",
			"@keyframes dcsSpin { to { transform: rotate(360deg) } }",
			".dcs-status { padding: 8px 10px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 11px; }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-chat-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-chat-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── session detail view ───────────── */

		function MessageView({ m }) {
			const tag = m.role === "assistant" ? (m.model ? "assistant · " + m.model : "assistant")
				: m.role === "user" ? "user"
				: m.role === "tool" ? "tool" + (m.isError ? " · error" : "")
				: "system";
			return h("div", { className: "dcs-msg", "data-role": m.role },
				h("div", { className: "dcs-msgTag" }, tag),
				m.text ? h("div", { className: "dcs-bubble" }, m.text) : null,
				m.toolUses && m.toolUses.length ? h("div", { className: "dcs-tools" },
					m.toolUses.map((t, i) => h("span", { className: "dcs-tool", key: i, title: oneLine(t.input, 200) }, "🔧 " + t.name)),
				) : null,
			);
		}

		function SessionDetail({ session, onBack }) {
			const [data, setData] = useState(null);
			const [error, setError] = useState("");
			const [loading, setLoading] = useState(true);
			const scroller = useRef(null);

			useEffect(() => {
				let cancelled = false;
				setLoading(true);
				setError("");
				getJSON(API.session({ id: session.id, from: "0" }))
					.then((res) => { if (!cancelled) setData(res); })
					.catch((e) => { if (!cancelled) setError(String(e.message || e)); })
					.finally(() => { if (!cancelled) setLoading(false); });
				return () => { cancelled = true; };
			}, [session.id]);

			useEffect(() => {
				const el = scroller.current;
				if (el) el.scrollTop = el.scrollHeight;
			}, [data]);

			return h("div", { className: "dcs-detail" },
				h("div", { className: "dcs-detailHead" },
					h("button", { className: "dcs-detailBack", onClick: onBack, title: "返回列表" },
						h("svg", { viewBox: "0 0 16 16", width: 14, height: 14, fill: "none", stroke: "currentColor", strokeWidth: 1.5 },
							h("path", { d: "M10 3L5 8l5 5" })
						)
					),
					h("span", { className: "dcs-detailTitle", title: session.title }, session.title),
					h("span", { className: "dcs-detailMeta" }, data ? data.count + " 条" : ""),
				),
				h("div", { className: "dcs-msgs", ref: scroller },
					loading ? h("div", { className: "dcs-status" }, h("span", { className: "dcs-loading" })) :
					error ? h("div", { className: "dcs-status" }, "加载失败：" + error) :
					data && data.messages.length ? data.messages.map((m) => h(MessageView, { m, key: m.seq })) :
					h("div", { className: "dcs-status" }, "无消息"),
				),
			);
		}

		/* ───────────── source group with sessions ───────────── */

		function SourceGroup({ source, sessions, selected, onSelect }) {
			const [open, setOpen] = useState(true);
			const meta = SOURCE_META[source];
			const count = sessions.length;

			if (count === 0) return null;

			return h("div", { className: "dcs-sourceGroup" },
				h("div", { className: "dcs-sourceHead", onClick: () => setOpen((v) => !v) },
					h("svg", { className: "dcs-sourceArrow", "data-open": open ? "1" : "0", viewBox: "0 0 16 16", width: 14, height: 14, fill: "currentColor" },
						h("path", { d: "M6 4l4 4-4 4" })
					),
					h("span", { className: "dcs-sourceBadge", style: { background: meta.color } }, meta.icon),
					h("span", { className: "dcs-sourceLabel" }, meta.label),
					h("span", { className: "dcs-sourceCount" }, count),
				),
				open ? h("div", { className: "dcs-sessionList" },
					sessions.map((s) => h("button", {
						key: s.id,
						className: "dcs-row",
						"data-selected": selected && selected.id === s.id ? "1" : "0",
						onClick: () => onSelect(s),
					},
						h("div", { className: "dcs-rowTitle" },
							s.live ? h("span", { className: "dcs-rowLive" }) : null,
							s.title,
						),
						h("div", { className: "dcs-rowMeta" },
							h("span", { className: "dcs-rowProject", title: s.cwd || s.project }, s.project),
							h("span", null, relTime(s.updatedAt)),
							h("span", null, fmtBytes(s.size)),
						),
					)),
				) : null,
			);
		}

		/* ───────────── main tree component ───────────── */

		function ChatSyncTree() {
			const [sessions, setSessions] = useState([]);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState("");
			const [q, setQ] = useState("");
			const [liveOnly, setLiveOnly] = useState(false);
			const [selected, setSelected] = useState(null);
			const [sseOn, setSseOn] = useState(false);
			const fetchTimer = useRef(undefined);

			const fetchList = useCallback(async () => {
				try {
					const res = await getJSON(API.sessions({ source: "all", q, limit: "500", live: liveOnly ? "1" : "0" }));
					setSessions(res.sessions || []);
					setError("");
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [q, liveOnly]);

			useEffect(() => {
				setLoading(true);
				void fetchList();
			}, [fetchList]);

			// SSE live sync
			useEffect(() => {
				let es;
				try {
					es = new EventSource(API.events);
				} catch {
					return;
				}
				es.onopen = () => setSseOn(true);
				es.onerror = () => setSseOn(false);
				es.onmessage = (ev) => {
					let frame;
					try {
						frame = JSON.parse(ev.data);
					} catch {
						return;
					}
					if (!frame || frame.type !== "changed") return;
					// Refresh list on changes
					if (fetchTimer.current) clearTimeout(fetchTimer.current);
					fetchTimer.current = setTimeout(() => {
						fetchTimer.current = undefined;
						void fetchList();
					}, 500);
				};
				return () => {
					if (fetchTimer.current) clearTimeout(fetchTimer.current);
					es.close();
					setSseOn(false);
				};
			}, [fetchList]);

			// Group sessions by source
			const grouped = useMemo(() => {
				const groups = { claude: [], codex: [], cursor: [] };
				for (const s of sessions) {
					if (groups[s.source]) groups[s.source].push(s);
				}
				return groups;
			}, [sessions]);

			// Show detail view if a session is selected
			if (selected) {
				return h(SessionDetail, {
					session: selected,
					onBack: () => setSelected(null),
				});
			}

			// Tree view
			return h("div", { className: "dcs-tree" },
				h("div", { className: "dcs-toolbar" },
					h("input", {
						className: "dcs-search",
						placeholder: "搜索…",
						value: q,
						onChange: (e) => setQ(e.target.value),
					}),
					h("button", {
						className: "dcs-liveBtn",
						"data-on": liveOnly ? "1" : "0",
						onClick: () => setLiveOnly((v) => !v),
						title: "只看活跃会话",
					},
						h("span", { className: "dcs-dot" }),
						"活跃",
					),
				),
				h("div", { className: "dcs-scroll" },
					error ? h("div", { className: "dcs-status" }, "加载失败：" + error) :
					loading ? h("div", { className: "dcs-status" }, h("span", { className: "dcs-loading" })) :
					SOURCES.map((src) => h(SourceGroup, {
						key: src,
						source: src,
						sessions: grouped[src] || [],
						selected,
						onSelect: setSelected,
					})),
				),
			);
		}

		/* ───────────── locale ───────────── */

		const NS = "settings.chatSync";

		const zh = {
			nav: "对话同步",
		};

		const en = {
			nav: "Chat Sync",
		};

		/* ───────────── plugin entry ───────────── */

		const inject = ["slots", "locale"];

		function apply(ctx) {
			console.log("[chat-sync] 客户端初始化");
			injectStyles();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "chat-sync: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "chat-sync",
				order: 35,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({}),
			}, ChatSyncTree));
			console.log("[chat-sync] 设置页注册完成");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
