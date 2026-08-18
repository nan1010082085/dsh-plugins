/**
 * dsh-mcp-sync - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-mcp-sync/client.js and
 * materialized through window.__ModuleLoader__. Registers a tab in
 * dsh-better-sidebar showing MCP configurations from Claude Code,
 * Codex CLI, and Cursor Agent with dedup, management, and custom MCP support.
 */
window.__ModuleLoader__.load({
	id: "dsh-mcp-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { useState, useEffect, useRef, useMemo, useCallback } = React;
		const h = React.createElement;

		/* ───────────── constants & helpers ───────────── */

		const API = {
			status: "/api/dsh-mcp-sync/status",
			servers: (params) => "/api/dsh-mcp-sync/servers?" + new URLSearchParams(params),
			config: (params) => "/api/dsh-mcp-sync/config?" + new URLSearchParams(params),
			custom: "/api/dsh-mcp-sync/custom",
		};

		const SOURCE_META = {
			claude: { label: "Claude Code", color: "#d97757", icon: "C" },
			codex: { label: "Codex CLI", color: "#10a37f", icon: "X" },
			cursor: { label: "Cursor Agent", color: "#3ea8ff", icon: "U" },
			custom: { label: "自定义", color: "#a855f7", icon: "*" },
		};

		async function getJSON(url) {
			const res = await fetch(url, { headers: { accept: "application/json" } });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		async function postJSON(url, data) {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json", accept: "application/json" },
				body: JSON.stringify(data),
			});
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		async function deleteJSON(url) {
			const res = await fetch(url, { method: "DELETE", headers: { accept: "application/json" } });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		/* ───────────── styles ───────────── */

		const CSS = [
			/* container */
			".mcs-panel { display: flex; flex-direction: column; height: 100%; font-family: var(--dsw-font-family); }",
			".mcs-toolbar { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); flex: none; flex-wrap: wrap; }",
			".mcs-title { font-size: 14px; font-weight: 700; color: var(--dsw-alias-label-primary); }",
			".mcs-chips { display: flex; gap: 4px; }",
			".mcs-chip { border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); background: transparent; color: var(--dsw-alias-label-secondary); border-radius: 999px; padding: 3px 10px; font-size: 11px; cursor: pointer; }",
			".mcs-chip:hover { background: rgba(127,127,127,.08); }",
			".mcs-chip[data-on='1'] { background: rgba(127,127,127,.15); color: var(--dsw-alias-label-primary); font-weight: 600; }",
			".mcs-search { flex: 1; min-width: 120px; height: 26px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 12px; outline: none; }",
			".mcs-search:focus { border-color: rgba(127,127,127,.4); }",
			".mcs-count { font-size: 11px; color: var(--dsw-alias-label-secondary); flex: none; }",
			".mcs-btn { border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }",
			".mcs-btn:hover { background: rgba(127,127,127,.08); color: var(--dsw-alias-label-primary); }",
			".mcs-btn-primary { background: var(--dsw-alias-state-business-primary, #3e84ff); color: #fff; border-color: transparent; }",
			".mcs-btn-primary:hover { opacity: .9; }",
			".mcs-btn-danger { color: var(--dsw-alias-state-error-primary, #ff3b30); border-color: var(--dsw-alias-state-error-primary, #ff3b30); }",
			".mcs-btn-danger:hover { background: rgba(255,59,48,.1); }",

			/* server list */
			".mcs-scroll { flex: 1; overflow-y: auto; padding: 8px; }",
			".mcs-empty { padding: 24px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }",
			".mcs-loading { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(127,127,127,.2); border-top-color: var(--dsw-alias-label-primary); border-radius: 50%; animation: mcsSpin .8s linear infinite; }",
			"@keyframes mcsSpin { to { transform: rotate(360deg) } }",

			/* server card */
			".mcs-card { border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.04)); }",
			".mcs-cardHead { display: flex; align-items: center; gap: 8px; }",
			".mcs-cardName { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".mcs-cardType { font-size: 10px; padding: 1px 6px; border-radius: 4px; background: rgba(127,127,127,.12); color: var(--dsw-alias-label-secondary); flex: none; }",
			".mcs-sourceBadges { display: flex; gap: 3px; flex: none; }",
			".mcs-sourceBadge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; color: #fff; }",
			".mcs-cardActions { display: flex; gap: 4px; flex: none; }",
			".mcs-cardMeta { margin-top: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }",
			".mcs-cardCommand { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--dsw-alias-label-secondary); background: rgba(127,127,127,.08); padding: 2px 6px; border-radius: 4px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
			".mcs-cardUrl { font-size: 11px; color: var(--dsw-alias-state-business-primary); margin-top: 4px; word-break: break-all; }",

			/* stats */
			".mcs-stats { display: flex; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); flex: none; flex-wrap: wrap; }",
			".mcs-stat { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }",
			".mcs-statDot { width: 8px; height: 8px; border-radius: 50%; }",
			".mcs-statCount { font-weight: 600; color: var(--dsw-alias-label-primary); }",

			/* modal */
			".mcs-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1000; display: flex; align-items: center; justify-content: center; }",
			".mcs-modalCard { background: var(--dsw-alias-bg-layer-1, #1a1a22); border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); border-radius: 12px; padding: 20px; max-width: 480px; width: calc(100% - 48px); max-height: 80vh; overflow-y: auto; }",
			".mcs-modalTitle { font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--dsw-alias-label-primary); }",
			".mcs-form { display: flex; flex-direction: column; gap: 12px; }",
			".mcs-field { display: flex; flex-direction: column; gap: 4px; }",
			".mcs-label { font-size: 12px; color: var(--dsw-alias-label-secondary); }",
			".mcs-input { height: 32px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 13px; outline: none; font-family: inherit; }",
			".mcs-input:focus { border-color: rgba(127,127,127,.45); }",
			".mcs-textarea { min-height: 80px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 8px 10px; font-size: 13px; outline: none; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }",
			".mcs-textarea:focus { border-color: rgba(127,127,127,.45); }",
			".mcs-modalActions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }",
			".mcs-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); opacity: .7; }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-mcp-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-mcp-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── server card component ───────────── */

		function ServerCard({ server, onDelete }) {
			const sources = server.sources || [server.source];
			const isCustom = server.source === "custom";

			return h("div", { className: "mcs-card" },
				h("div", { className: "mcs-cardHead" },
					h("span", { className: "mcs-cardName", title: server.name }, server.name),
					h("span", { className: "mcs-cardType" }, server.type),
					h("div", { className: "mcs-sourceBadges" },
						sources.map((src) => {
							const meta = SOURCE_META[src];
							return h("span", {
								key: src,
								className: "mcs-sourceBadge",
								style: { background: meta?.color || "#888" },
								title: meta?.label || src,
							}, meta?.icon || src[0].toUpperCase());
						}),
					),
					h("div", { className: "mcs-cardActions" },
						isCustom ? h("button", {
							className: "mcs-btn mcs-btn-danger",
							onClick: () => onDelete(server.name),
							title: "删除",
						}, "删除") : null,
					),
				),
				server.type === "stdio" ? h("div", { className: "mcs-cardCommand", title: server.command + " " + server.args.join(" ") },
					server.command,
					server.args.length > 0 ? " " + server.args.join(" ") : "",
				) : null,
				server.type === "sse" && server.url ? h("div", { className: "mcs-cardUrl" }, server.url) : null,
			);
		}

		/* ───────────── add custom MCP modal ───────────── */

		function AddMcpModal({ onClose, onAdd }) {
			const [name, setName] = useState("");
			const [type, setType] = useState("stdio");
			const [command, setCommand] = useState("");
			const [args, setArgs] = useState("");
			const [url, setUrl] = useState("");
			const [env, setEnv] = useState("");
			const [error, setError] = useState("");

			const handleSubmit = () => {
				if (!name.trim()) {
					setError("名称不能为空");
					return;
				}

				const config = { type };

				if (type === "stdio") {
					if (!command.trim()) {
						setError("命令不能为空");
						return;
					}
					config.command = command.trim();
					config.args = args.trim() ? args.trim().split(/\s+/) : [];
				} else {
					if (!url.trim()) {
						setError("URL 不能为空");
						return;
					}
					config.url = url.trim();
				}

				if (env.trim()) {
					try {
						config.env = JSON.parse(env);
					} catch {
						setError("环境变量格式错误（需要 JSON 格式）");
						return;
					}
				}

				onAdd(name.trim(), config);
			};

			return h("div", { className: "mcs-modal", onClick: (e) => e.target === e.currentTarget && onClose() },
				h("div", { className: "mcs-modalCard" },
					h("div", { className: "mcs-modalTitle" }, "添加自定义 MCP"),
					h("div", { className: "mcs-form" },
						h("div", { className: "mcs-field" },
							h("label", { className: "mcs-label" }, "名称"),
							h("input", {
								className: "mcs-input",
								value: name,
								onChange: (e) => setName(e.target.value),
								placeholder: "my-mcp-server",
							}),
						),
						h("div", { className: "mcs-field" },
							h("label", { className: "mcs-label" }, "类型"),
							h("div", { style: { display: "flex", gap: 8 } },
								h("button", {
									className: "mcs-chip",
									"data-on": type === "stdio" ? "1" : "0",
									onClick: () => setType("stdio"),
								}, "stdio"),
								h("button", {
									className: "mcs-chip",
									"data-on": type === "sse" ? "1" : "0",
									onClick: () => setType("sse"),
								}, "sse"),
							),
						),
						type === "stdio" ? h(React.Fragment, null,
							h("div", { className: "mcs-field" },
								h("label", { className: "mcs-label" }, "命令"),
								h("input", {
									className: "mcs-input",
									value: command,
									onChange: (e) => setCommand(e.target.value),
									placeholder: "npx",
								}),
							),
							h("div", { className: "mcs-field" },
								h("label", { className: "mcs-label" }, "参数（空格分隔）"),
								h("input", {
									className: "mcs-input",
									value: args,
									onChange: (e) => setArgs(e.target.value),
									placeholder: "-y @upstash/context7-mcp",
								}),
							),
						) : h("div", { className: "mcs-field" },
							h("label", { className: "mcs-label" }, "URL"),
							h("input", {
								className: "mcs-input",
								value: url,
								onChange: (e) => setUrl(e.target.value),
								placeholder: "http://localhost:3000/sse",
							}),
						),
						h("div", { className: "mcs-field" },
							h("label", { className: "mcs-label" }, "环境变量（JSON 格式，可选）"),
							h("textarea", {
								className: "mcs-textarea",
								value: env,
								onChange: (e) => setEnv(e.target.value),
								placeholder: '{"KEY": "value"}',
							}),
						),
						error ? h("div", { style: { color: "var(--dsw-alias-state-error-primary, #ff3b30)", fontSize: 12 } }, error) : null,
					),
					h("div", { className: "mcs-modalActions" },
						h("button", { className: "mcs-btn", onClick: onClose }, "取消"),
						h("button", { className: "mcs-btn mcs-btn-primary", onClick: handleSubmit }, "添加"),
					),
				),
			);
		}

		/* ───────────── main panel component ───────────── */

		function McpSyncPanel() {
			const [data, setData] = useState(null);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState("");
			const [source, setSource] = useState("all");
			const [q, setQ] = useState("");
			const [showAddModal, setShowAddModal] = useState(false);

			const fetchData = useCallback(async () => {
				try {
					setLoading(true);
					const result = await getJSON(API.servers({ source }));
					setData(result);
					setError("");
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [source]);

			useEffect(() => {
				void fetchData();
			}, [fetchData]);

			// Filter by search query
			const filtered = useMemo(() => {
				if (!data?.servers) return [];
				if (!q.trim()) return data.servers;
				const needle = q.toLowerCase();
				return data.servers.filter((s) =>
					s.name.toLowerCase().includes(needle) ||
					s.command.toLowerCase().includes(needle) ||
					(s.url && s.url.toLowerCase().includes(needle))
				);
			}, [data, q]);

			const handleAdd = async (name, config) => {
				try {
					await postJSON(API.custom, { name, config });
					setShowAddModal(false);
					void fetchData();
				} catch (e) {
					alert("添加失败：" + e.message);
				}
			};

			const handleDelete = async (name) => {
				if (!confirm(`确定删除自定义 MCP "${name}"？`)) return;
				try {
					await deleteJSON(API.custom + "?name=" + encodeURIComponent(name));
					void fetchData();
				} catch (e) {
					alert("删除失败：" + e.message);
				}
			};

			const chips = [
				{ id: "all", label: "全部" },
				{ id: "claude", label: "Claude" },
				{ id: "codex", label: "Codex" },
				{ id: "cursor", label: "Cursor" },
				{ id: "custom", label: "自定义" },
			];

			return h("div", { className: "mcs-panel" },
				h("div", { className: "mcs-toolbar" },
					h("span", { className: "mcs-title" }, "MCP 配置"),
					h("div", { className: "mcs-chips" },
						chips.map((c) => h("button", {
							key: c.id,
							className: "mcs-chip",
							"data-on": source === c.id ? "1" : "0",
							onClick: () => setSource(c.id),
						}, c.label)),
					),
					h("input", {
						className: "mcs-search",
						placeholder: "搜索 MCP 服务…",
						value: q,
						onChange: (e) => setQ(e.target.value),
					}),
					h("span", { className: "mcs-count" }, data ? filtered.length + "/" + data.total : ""),
					h("button", { className: "mcs-btn", onClick: () => setShowAddModal(true) }, "+ 添加"),
					h("button", { className: "mcs-btn", onClick: fetchData, title: "刷新" },
						h("svg", { viewBox: "0 0 16 16", width: 12, height: 12, fill: "none", stroke: "currentColor", strokeWidth: 1.5 },
							h("path", { d: "M2 8a6 6 0 0 1 10.47-4M14 8a6 6 0 0 1-10.47 4" }),
							h("path", { d: "M12 1v3h-3M4 15v-3h3" }),
						),
					),
				),
				data ? h("div", { className: "mcs-stats" },
					h("div", { className: "mcs-stat" },
						h("span", { className: "mcs-statDot", style: { background: SOURCE_META.claude.color } }),
						"Claude: ",
						h("span", { className: "mcs-statCount" }, data.bySource.claude),
					),
					h("div", { className: "mcs-stat" },
						h("span", { className: "mcs-statDot", style: { background: SOURCE_META.codex.color } }),
						"Codex: ",
						h("span", { className: "mcs-statCount" }, data.bySource.codex),
					),
					h("div", { className: "mcs-stat" },
						h("span", { className: "mcs-statDot", style: { background: SOURCE_META.cursor.color } }),
						"Cursor: ",
						h("span", { className: "mcs-statCount" }, data.bySource.cursor),
					),
					h("div", { className: "mcs-stat" },
						h("span", { className: "mcs-statDot", style: { background: SOURCE_META.custom.color } }),
						"自定义: ",
						h("span", { className: "mcs-statCount" }, data.bySource.custom || 0),
					),
				) : null,
				h("div", { className: "mcs-scroll" },
					error ? h("div", { className: "mcs-empty" }, "加载失败：" + error) :
					loading ? h("div", { className: "mcs-empty" }, h("span", { className: "mcs-loading" })) :
					filtered.length === 0 ? h("div", { className: "mcs-empty" }, q ? "没有匹配的 MCP 服务" : "未发现 MCP 配置") :
					filtered.map((server) => h(ServerCard, {
						key: server.name + ":" + server.source,
						server,
						onDelete: handleDelete,
					})),
				),
				showAddModal ? h(AddMcpModal, {
					onClose: () => setShowAddModal(false),
					onAdd: handleAdd,
				}) : null,
			);
		}

		/* ───────────── settings section ───────────── */

		function McpSyncSettings({ ctx }) {
			const [config, setConfig] = useState({
				enabled: true,
				autoSync: true,
				syncInterval: 60000,
				dedupeByCommand: true,
				sources: { claude: true, codex: true, cursor: true },
			});

			return h("div", { style: { padding: "16px 0" } },
				h("h3", { style: { fontSize: 14, fontWeight: 600, marginBottom: 12 } }, "MCP 同步设置"),
				h("div", { style: { display: "flex", flexDirection: "column", gap: 12 } },
					h("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
						h("input", {
							type: "checkbox",
							checked: config.enabled,
							onChange: (e) => setConfig((c) => ({ ...c, enabled: e.target.checked })),
						}),
						h("span", null, "启用插件"),
					),
					h("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
						h("input", {
							type: "checkbox",
							checked: config.autoSync,
							onChange: (e) => setConfig((c) => ({ ...c, autoSync: e.target.checked })),
						}),
						h("span", null, "启动时自动同步"),
					),
					h("label", { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
						h("input", {
							type: "checkbox",
							checked: config.dedupeByCommand,
							onChange: (e) => setConfig((c) => ({ ...c, dedupeByCommand: e.target.checked })),
						}),
						h("span", null, "按命令去重"),
					),
					h("div", null,
						h("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)", marginBottom: 4 } }, "同步来源"),
						h("div", { style: { display: "flex", gap: 8 } },
							["claude", "codex", "cursor"].map((src) =>
								h("label", {
									key: src,
									style: { display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 13 },
								},
									h("input", {
										type: "checkbox",
										checked: config.sources[src],
										onChange: (e) => setConfig((c) => ({
											...c,
											sources: { ...c.sources, [src]: e.target.checked },
										})),
									}),
									SOURCE_META[src].label,
								)
							),
						),
					),
				),
			);
		}

		/* ───────────── plugin entry ───────────── */

		const inject = ["betterSidebar", "slots"];

		function apply(ctx) {
			injectStyles();

			// Register tab in dsh-better-sidebar
			const disposeTab = ctx.betterSidebar.registerTab({
				id: "mcp-sync",
				title: () => "MCP 配置",
				icon: (size) => h("svg", {
					viewBox: "0 0 16 16",
					width: size,
					height: size,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: 1.3,
					strokeLinecap: "round",
					strokeLinejoin: "round",
				},
					h("circle", { cx: 8, cy: 8, r: 3 }),
					h("path", { d: "M8 1v2M8 13v2M1 8h2M13 8h2" }),
					h("path", { d: "M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4" }),
				),
				order: 40,
				single: true,
				component: () => h(McpSyncPanel),
			});

			// Register settings section
			const disposeSettings = ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "mcp-sync",
				order: 150,
				label: () => "MCP 同步",
			}, McpSyncSettings));

			ctx.effect(() => () => {
				disposeTab();
				disposeSettings();
			}, "dsh-mcp-sync: sidebar tab + settings");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
