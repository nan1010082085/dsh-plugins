/**
 * dsh-chat-sync - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-chat-sync/client.js and
 * materialized through window.__ModuleLoader__. Mounts two DOM surfaces
 * following the dsh-ssh/task-board precedent: a sidebar entry row and a
 * center-column panel (React root) that lists local Claude Code / Codex CLI /
 * Cursor Agent conversations and live-syncs them over SSE.
 */
window.__ModuleLoader__.load({
	id: "dsh-chat-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { createRoot } = require("react-dom/client");
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
			claude: { label: "Claude", color: "#d97757" },
			codex: { label: "Codex", color: "#10a37f" },
			cursor: { label: "Cursor", color: "#3ea8ff" },
		};

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

		/* ───────────── panel controller ───────────── */

		const OTHER_PANEL_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		const ACTIVATE_EVENT = "dsh-panel-activate";

		class PanelController {
			constructor() {
				this.panelOpen = false;
				this.listeners = new Set();
				this.onOpen = () => {};
				this.onClose = () => {};
			}
			getSnapshot() {
				return { panelOpen: this.panelOpen };
			}
			subscribe(fn) {
				this.listeners.add(fn);
				return () => this.listeners.delete(fn);
			}
			open() {
				if (this.panelOpen) return;
				this.panelOpen = true;
				const root = document.documentElement;
				root.setAttribute("data-dsh-chatsync-active", "");
				for (const attr of OTHER_PANEL_ATTRS) root.removeAttribute(attr);
				window.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: "chatsync" }));
				this.onOpen();
				this.notify();
			}
			close() {
				if (!this.panelOpen) return;
				this.panelOpen = false;
				document.documentElement.removeAttribute("data-dsh-chatsync-active");
				this.onClose();
				this.notify();
			}
			toggle() {
				if (this.panelOpen) this.close();
				else this.open();
			}
			notify() {
				for (const fn of [...this.listeners]) fn();
			}
		}

		/* ───────────── styles ───────────── */

		const CSS = [
			/* center-column takeover (attribute-scoped global rules) */
			"[data-pane='conversation'], [class*='centerCol'] { position: relative; }",
			"[data-dsh-chatsync-view] { position: absolute; inset: 0; display: none; z-index: 60; background: var(--dsw-alias-bg-base); }",
			"html[data-dsh-chatsync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-dsh-chatsync-view] { display: block; }",
			"html[data-dsh-chatsync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [data-pane='conversation'] > :not([data-dsh-chatsync-view]),",
			"html[data-dsh-chatsync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) [class*='centerCol'] > :not([data-dsh-chatsync-view]) { display: none !important; }",

			/* sidebar entry */
			".dcs-entry { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 12px; background: transparent; border: none; border-radius: 8px; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; white-space: nowrap; }",
			".dcs-entry:hover { background: var(--dsw-specific-sidebar-nav-item-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary); }",
			".dcs-entry[data-active] { background: var(--dsw-specific-sidebar-nav-item-active, rgba(127,127,127,.16)); color: var(--dsw-alias-label-primary); font-weight: 600; }",
			".dcs-entryIcon { display: inline-flex; align-items: center; justify-content: center; flex: none; }",
			".dcs-entryLabel { overflow: hidden; text-overflow: ellipsis; }",
			"[data-dsh-frame][data-sidebar-collapsed] .dcs-entry { justify-content: center; padding: 0; }",
			"[data-dsh-frame][data-sidebar-collapsed] .dcs-entryLabel { display: none; }",

			/* panel frame */
			".dcs-panel { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); }",
			".dcs-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px 10px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); flex: none; flex-wrap: wrap; }",
			".dcs-title { font-size: 15px; font-weight: 700; margin-right: 4px; }",
			".dcs-chips { display: flex; gap: 4px; }",
			".dcs-chip { border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; }",
			".dcs-chip:hover { background: rgba(127,127,127,.12); }",
			".dcs-chip[data-on='1'] { background: rgba(127,127,127,.18); color: var(--dsw-alias-label-primary); font-weight: 600; }",
			".dcs-search { flex: 1; min-width: 140px; max-width: 320px; height: 28px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 12px; outline: none; }",
			".dcs-search:focus { border-color: rgba(127,127,127,.45); }",
			".dcs-liveChip { display: inline-flex; align-items: center; gap: 5px; }",
			".dcs-dot { width: 7px; height: 7px; border-radius: 50%; background: #34c759; display: inline-block; }",
			".dcs-dot[data-off='1'] { background: rgba(127,127,127,.45); }",
			".dcs-body { flex: 1; display: flex; min-height: 0; }",
			".dcs-close { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 16px; padding: 2px 6px; border-radius: 6px; }",
			".dcs-close:hover { background: rgba(127,127,127,.12); color: var(--dsw-alias-label-primary); }",

			/* session list */
			".dcs-list { width: 300px; flex: none; overflow-y: auto; border-right: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); padding: 6px; }",
			".dcs-row { display: block; width: 100%; text-align: left; border: none; background: transparent; border-radius: 8px; padding: 8px 10px; cursor: pointer; color: inherit; }",
			".dcs-row:hover { background: rgba(127,127,127,.1); }",
			".dcs-row[data-on='1'] { background: rgba(127,127,127,.16); }",
			".dcs-rowTop { display: flex; align-items: center; gap: 6px; }",
			".dcs-badge { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; color: #fff; flex: none; letter-spacing: .3px; }",
			".dcs-rowTitle { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".dcs-liveDot { width: 6px; height: 6px; border-radius: 50%; background: #34c759; flex: none; animation: dcsPulse 1.6s infinite; }",
			"@keyframes dcsPulse { 0%,100% { opacity: 1 } 50% { opacity: .25 } }",
			".dcs-rowSub { display: flex; gap: 8px; margin-top: 3px; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; white-space: nowrap; }",
			".dcs-rowProject { overflow: hidden; text-overflow: ellipsis; max-width: 55%; }",
			".dcs-rowTime { flex: none; }",
			".dcs-listStatus { padding: 18px 12px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }",

			/* detail */
			".dcs-detail { flex: 1; min-width: 0; display: flex; flex-direction: column; }",
			".dcs-detailHead { flex: none; display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); }",
			".dcs-detailTitle { font-size: 13px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".dcs-detailMeta { font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }",
			".dcs-msgs { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }",
			".dcs-msg { margin-bottom: 10px; max-width: 92%; }",
			".dcs-msg[data-role='user'] { margin-left: auto; }",
			".dcs-bubble { border-radius: 10px; padding: 8px 12px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }",
			".dcs-msg[data-role='user'] .dcs-bubble { background: rgba(62,132,255,.16); border: 1px solid rgba(62,132,255,.25); }",
			".dcs-msg[data-role='assistant'] .dcs-bubble { background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.08)); border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.18)); }",
			".dcs-msg[data-role='system'] .dcs-bubble, .dcs-msg[data-role='tool'] .dcs-bubble { background: transparent; border: 1px dashed rgba(127,127,127,.3); color: var(--dsw-alias-label-secondary); font-size: 12px; }",
			".dcs-msgTag { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-bottom: 2px; display: flex; gap: 6px; align-items: center; }",
			".dcs-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }",
			".dcs-tool { font-size: 11px; background: rgba(127,127,127,.12); border: 1px solid rgba(127,127,127,.2); border-radius: 6px; padding: 2px 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); }",
			".dcs-toolInput { color: var(--dsw-alias-label-secondary); opacity: .8; }",
			".dcs-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }",
			".dcs-loading { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(127,127,127,.3); border-top-color: var(--dsw-alias-label-primary); border-radius: 50%; animation: dcsSpin .8s linear infinite; }",
			"@keyframes dcsSpin { to { transform: rotate(360deg) } }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-chat-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-chat-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── sidebar entry (self-healing DOM row) ───────────── */

		const ENTRY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3.5h11v9h-11z"/><path d="M2.5 6h11"/><path d="M4.5 8.5h4"/><path d="M4.5 10.5h2.5"/></svg>';

		function sidebarRoot() {
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
			if (!column) return undefined;
			const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
			return logoOwner ?? column.firstElementChild ?? undefined;
		}

		function mountSidebarEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshChatsyncEntry = "";
			entry.className = "dcs-entry";
			entry.setAttribute("aria-label", "对话同步");
			entry.title = "同步本地 Claude / Codex / Cursor 对话";
			entry.innerHTML = '<span class="dcs-entryIcon">' + ENTRY_ICON + '</span><span class="dcs-entryLabel">对话同步</span>';
			entry.addEventListener("click", () => controller.toggle());

			let observer = undefined;
			const syncActive = () => {
				entry.setAttribute("data-active", controller.panelOpen ? "1" : "0");
			};
			controller.subscribe(syncActive);

			const place = () => {
				const root = sidebarRoot();
				if (!root || entry.isConnected) return;
				let anchor = root.querySelector('button[class*="newSession"]');
				if (!anchor) {
					for (const child of root.children) if (child.tagName === "BUTTON") { anchor = child; break; }
				}
				if (anchor && anchor.parentElement) anchor.parentElement.insertBefore(entry, anchor.nextSibling);
				else root.appendChild(entry);
			};
			place();
			// Self-heal when a React re-render displaces the row.
			observer = new MutationObserver(place);
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
			if (column) observer.observe(column, { childList: true, subtree: true });
			return () => {
				observer?.disconnect();
				entry.remove();
			};
		}

		/* ───────────── React: message view ───────────── */

		function MessageView({ m }) {
			const tag = m.role === "assistant" ? (m.model ? "assistant · " + m.model : "assistant")
				: m.role === "user" ? "user"
				: m.role === "tool" ? "tool" + (m.isError ? " · error" : "")
				: "system";
			return h("div", { className: "dcs-msg", "data-role": m.role },
				h("div", { className: "dcs-msgTag" }, tag),
				m.text ? h("div", { className: "dcs-bubble" }, m.text) : null,
				m.toolUses && m.toolUses.length ? h("div", { className: "dcs-tools" },
					m.toolUses.map((t, i) => h("span", { className: "dcs-tool", key: i, title: oneLine(t.input, 300) }, "🔧 " + t.name)),
				) : null,
			);
		}

		/* ───────────── React: detail pane ───────────── */

		function DetailPane({ session, liveTick }) {
			const [data, setData] = useState(null);
			const [error, setError] = useState("");
			const [loading, setLoading] = useState(true);
			const [follow, setFollow] = useState(true);
			const scroller = useRef(null);
			const nextRef = useRef(0);
			const idRef = useRef(session.id);
			const [tick, setTick] = useState(0);

			// Reset when a different session is opened.
			useEffect(() => {
				if (idRef.current !== session.id) {
					idRef.current = session.id;
					nextRef.current = 0;
					setData(null);
					setError("");
					setLoading(true);
					setTick((t) => t + 1);
				}
			}, [session.id]);

			// Live updates: parent bumps liveTick when SSE names this session.
			useEffect(() => {
				if (!liveTick) return;
				setTick((t) => t + 1);
			}, [liveTick]);

			const load = useCallback(async (from) => {
				try {
					const res = await getJSON(API.session({ id: session.id, from: String(from) }));
					setError("");
					setData((prev) => {
						if (!prev || res.reset || from === 0) return res;
						return { ...res, messages: prev.messages.concat(res.messages) };
					});
					nextRef.current = res.next;
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [session.id]);

			useEffect(() => {
				setLoading(true);
				void load(0);
			}, [tick, load]);

			// Auto-scroll when following.
			useEffect(() => {
				const el = scroller.current;
				if (!el || !follow || !data) return;
				el.scrollTop = el.scrollHeight;
			}, [data, follow]);

			const onScroll = () => {
				const el = scroller.current;
				if (!el) return;
				setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
			};

			if (error) return h("div", { className: "dcs-listStatus" }, "加载失败：" + error);
			return h("div", { className: "dcs-detail" },
				h("div", { className: "dcs-detailHead" },
					h("span", { className: "dcs-badge", style: { background: SOURCE_META[session.source].color } }, SOURCE_META[session.source].label),
					h("span", { className: "dcs-detailTitle", title: session.cwd || session.title }, session.title),
					h("span", { className: "dcs-detailMeta" }, (session.project || "") + " · " + relTime(session.updatedAt) + (data ? " · " + data.count + " 条" : "")),
					session.live ? h("span", { className: "dcs-liveDot", title: "活跃会话" }) : null,
				),
				h("div", { className: "dcs-msgs", ref: scroller, onScroll },
					loading && !data ? h("div", { className: "dcs-listStatus" }, h("span", { className: "dcs-loading" })) :
					(data && data.messages.length ? data.messages.map((m) => h(MessageView, { m, key: m.seq })) :
						h("div", { className: "dcs-listStatus" }, "无消息")),
					loading && data ? h("div", { className: "dcs-listStatus" }, h("span", { className: "dcs-loading" })) : null,
				),
			);
		}

		/* ───────────── React: panel (list + detail) ───────────── */

		function Panel({ controller, onClose }) {
			const [source, setSource] = useState("all");
			const [q, setQ] = useState("");
			const [debouncedQ, setDebouncedQ] = useState("");
			const [liveOnly, setLiveOnly] = useState(false);
			const [sessions, setSessions] = useState([]);
			const [total, setTotal] = useState(0);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState("");
			const [selected, setSelected] = useState(null);
			const [liveTick, setLiveTick] = useState(0);
			const [sseOn, setSseOn] = useState(false);
			const listReload = useRef(0);
			const listTimer = useRef(undefined);

			// Debounce the search box.
			useEffect(() => {
				const t = setTimeout(() => setDebouncedQ(q), 300);
				return () => clearTimeout(t);
			}, [q]);

			const fetchList = useCallback(async () => {
				try {
					const res = await getJSON(API.sessions({ source, q: debouncedQ, limit: "300", live: liveOnly ? "1" : "0" }));
					setSessions(res.sessions || []);
					setTotal(res.total || 0);
					setError("");
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [source, debouncedQ, liveOnly]);

			useEffect(() => {
				setLoading(true);
				void fetchList();
			}, [fetchList]);

			// SSE live sync for the lifetime of the open panel.
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
					// Bump the open detail view immediately when named.
					const ids = new Set((frame.changed || []).map((c) => c.id));
					setSelected((cur) => {
						if (cur && ids.has(cur.id)) setLiveTick((t) => t + 1);
						return cur;
					});
					// Refresh the list on a short trailing edge.
					if (listTimer.current) clearTimeout(listTimer.current);
					listTimer.current = setTimeout(() => {
						listTimer.current = undefined;
						listReload.current += 1;
						void fetchList();
					}, 800);
				};
				return () => {
					if (listTimer.current) clearTimeout(listTimer.current);
					es.close();
					setSseOn(false);
				};
			}, [fetchList]);

			// Keep the selected row's metadata fresh after list reloads.
			useEffect(() => {
				if (!selected) return;
				const fresh = sessions.find((s) => s.id === selected.id);
				if (fresh && fresh.updatedAt !== selected.updatedAt) setSelected(fresh);
			}, [sessions, selected]);

			const chips = [{ id: "all", label: "全部" }].concat(Object.entries(SOURCE_META).map(([id, m]) => ({ id, label: m.label })));

			return h("div", { className: "dcs-panel" },
				h("div", { className: "dcs-header" },
					h("span", { className: "dcs-title" }, "对话同步"),
					h("span", { className: "dcs-chips" },
						chips.map((c) => h("button", {
							key: c.id, className: "dcs-chip", "data-on": source === c.id ? "1" : "0",
							onClick: () => setSource(c.id),
						}, c.label)),
					),
					h("input", { className: "dcs-search", placeholder: "搜索标题 / 项目 / 路径…", value: q, onChange: (e) => setQ(e.target.value) }),
					h("button", { className: "dcs-chip dcs-liveChip", "data-on": liveOnly ? "1" : "0", onClick: () => setLiveOnly((v) => !v), title: "只看最近活跃的会话" },
						h("span", { className: "dcs-dot", "data-off": sseOn ? "0" : "1" }), "动态同步", ),
					h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)", flex: "none" } }, total + " 场"),
					h("button", { className: "dcs-close", onClick: onClose, title: "关闭面板" }, "✕"),
				),
				h("div", { className: "dcs-body" },
					h("div", { className: "dcs-list" },
						error ? h("div", { className: "dcs-listStatus" }, "加载失败：" + error) :
						loading && !sessions.length ? h("div", { className: "dcs-listStatus" }, h("span", { className: "dcs-loading" })) :
						!sessions.length ? h("div", { className: "dcs-listStatus" }, "没有匹配的会话") :
						sessions.map((s) => h("button", {
							key: s.id, className: "dcs-row", "data-on": selected && selected.id === s.id ? "1" : "0",
							onClick: () => setSelected(s),
						},
							h("div", { className: "dcs-rowTop" },
								h("span", { className: "dcs-badge", style: { background: SOURCE_META[s.source].color } }, SOURCE_META[s.source].label),
								h("span", { className: "dcs-rowTitle", title: s.title }, s.title),
								s.live ? h("span", { className: "dcs-liveDot", title: "活跃" }) : null,
							),
							h("div", { className: "dcs-rowSub" },
								h("span", { className: "dcs-rowProject", title: s.cwd || s.project }, s.project),
								h("span", { className: "dcs-rowTime" }, relTime(s.updatedAt)),
								h("span", { style: { flex: "none", opacity: 0.7 } }, fmtBytes(s.size)),
							),
						)),
					),
					selected ? h(DetailPane, { session: selected, liveTick }) :
						h("div", { className: "dcs-empty" }, "选择左侧会话查看 Claude Code / Codex CLI / Cursor Agent 的本地对话"),
				),
			);
		}

		/* ───────────── React app root ───────────── */

		function useControllerOpen(controller) {
			const [open, setOpen] = useState(controller.getSnapshot().panelOpen);
			useEffect(() => controller.subscribe(() => setOpen(controller.getSnapshot().panelOpen)), [controller]);
			return open;
		}

		function App({ controller }) {
			const open = useControllerOpen(controller);
			if (!open) return null;
			return h(Panel, { controller, onClose: () => controller.close() });
		}

		/* ───────────── panel mount (center column takeover) ───────────── */

		const CONVERSATION_COLUMN = '[data-pane="conversation"], [class*="centerCol"]';

		function mountPanel(controller) {
			let root = undefined;
			let container = undefined;
			let renderDisposer = undefined;

			const ensure = () => {
				if (container && container.isConnected) return true;
				const column = document.querySelector(CONVERSATION_COLUMN);
				if (!column) return false;
				container = document.createElement("div");
				container.dataset.dshChatsyncView = "";
				column.appendChild(container);
				root = createRoot(container);
				root.render(h(App, { controller }));
				return true;
			};

			// Close when a sibling panel activates; also yield to them.
			const onSibling = (ev) => {
				if (ev.detail !== "chatsync") controller.close();
			};
			window.addEventListener(ACTIVATE_EVENT, onSibling);

			controller.onOpen = () => { ensure(); };
			// The shell may re-render the center column (view switches); re-seat.
			const observer = new MutationObserver(() => {
				if (controller.panelOpen) ensure();
			});
			const startObs = () => {
				const column = document.querySelector(CONVERSATION_COLUMN);
				if (column) observer.observe(column.parentElement ?? column, { childList: true, subtree: false });
			};
			startObs();
			const seatTimer = setInterval(() => {
				if (controller.panelOpen && container && !container.isConnected) ensure();
			}, 3000);

			renderDisposer = () => {};
			return () => {
				window.removeEventListener(ACTIVATE_EVENT, onSibling);
				observer.disconnect();
				clearInterval(seatTimer);
				try {
					root?.unmount();
				} catch { /* gone */ }
				container?.remove();
				renderDisposer?.();
			};
		}

		/* ───────────── plugin entry ───────────── */

		const inject = [];

		function apply(ctx) {
			injectStyles();
			const controller = new PanelController();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountPanel(controller));
			} catch (error) {
				console.warn("[dsh-chat-sync] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-chat-sync: ui mounts");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
