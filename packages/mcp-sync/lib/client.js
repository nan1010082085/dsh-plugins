/**
 * dsh-mcp-sync - browser half (hand-written, zero-build).
 *
 * Registers a tab in dsh-better-sidebar showing MCP configurations,
 * connection status, and discovered tools from all MCP servers.
 */
window.__ModuleLoader__.load({
	id: "dsh-mcp-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { useState, useEffect, useCallback } = React;
		const h = React.createElement;

		/* ───────────── constants & helpers ───────────── */

		var API = {
			servers: "/api/dsh-mcp-sync/servers",
			registry: "/api/dsh-mcp-sync/registry",
			connections: "/api/dsh-mcp-sync/connections",
			tools: "/api/dsh-mcp-sync/tools",
			connect: "/api/dsh-mcp-sync/connect",
			disconnect: "/api/dsh-mcp-sync/disconnect",
		};

		var SOURCE_META = {
			claude: { label: "Claude", color: "#d97757" },
			codex: { label: "Codex", color: "#10a37f" },
			cursor: { label: "Cursor", color: "#3ea8ff" },
			dsh: { label: "DSH", color: "#f59e0b" },
			custom: { label: "Custom", color: "#a855f7" },
		};

		var STATE_META = {
			connected: { label: "Connected", color: "#22c55e", icon: "\u25cf" },
			connecting: { label: "Connecting", color: "#f59e0b", icon: "\u25cb" },
			error: { label: "Error", color: "#ef4444", icon: "\u25cf" },
			disconnected: { label: "Disconnected", color: "#6b7280", icon: "\u25cb" },
		};

		async function getJSON(url) {
			var res = await fetch(url, { headers: { accept: "application/json" } });
			var body = await res.json().catch(function() { return null; });
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		async function postJSON(url, data) {
			var res = await fetch(url, {
				method: "POST",
				headers: { accept: "application/json", "content-type": "application/json" },
				body: JSON.stringify(data),
			});
			var body = await res.json().catch(function() { return null; });
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		/* ───────────── styles ───────────── */

		var CSS = [
			".mcp-panel { display: flex; flex-direction: column; height: 100%; font-family: var(--dsw-font-family); }",
			".mcp-header { padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,.15); display: flex; align-items: center; gap: 8px; }",
			".mcp-title { font-size: 14px; font-weight: 700; flex: 1; }",
			".mcp-btn { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px; }",
			".mcp-btn:hover { background: rgba(127,127,127,.1); }",
			".mcp-btn-primary { background: rgba(59,130,246,.15); color: #60a5fa; }",
			".mcp-btn-primary:hover { background: rgba(59,130,246,.25); }",
			".mcp-btn-danger { color: #f87171; }",
			".mcp-btn-danger:hover { background: rgba(239,68,68,.1); }",
			".mcp-stats { padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.1); display: flex; gap: 12px; font-size: 11px; color: var(--dsw-alias-label-secondary); flex-wrap: wrap; }",
			".mcp-statDot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 3px; vertical-align: middle; }",
			".mcp-tabs { display: flex; border-bottom: 1px solid rgba(127,127,127,.15); }",
			".mcp-tab { padding: 6px 14px; font-size: 12px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--dsw-alias-label-secondary); }",
			".mcp-tab:hover { color: var(--dsw-alias-label-primary); }",
			".mcp-tab-active { color: var(--dsw-alias-label-primary); border-bottom-color: #60a5fa; }",
			".mcp-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }",
			".mcp-row { padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.08); }",
			".mcp-row:last-child { border-bottom: none; }",
			".mcp-rowName { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }",
			".mcp-rowMeta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }",
			".mcp-rowSources { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }",
			".mcp-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; color: #fff; }",
			".mcp-stateBadge { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }",
			".mcp-empty { padding: 24px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }",
			".mcp-loading { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(127,127,127,.2); border-top-color: var(--dsw-alias-label-primary); border-radius: 50%; animation: mcpSpin .8s linear infinite; }",
			".mcp-connRow { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.08); }",
			".mcp-connState { width: 8px; height: 8px; border-radius: 50%; }",
			".mcp-connInfo { flex: 1; min-width: 0; }",
			".mcp-connName { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }",
			".mcp-connDetail { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }",
			".mcp-connActions { display: flex; gap: 4px; }",
			".mcp-toolRow { padding: 6px 12px; border-bottom: 1px solid rgba(127,127,127,.06); }",
			".mcp-toolName { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }",
			".mcp-toolDesc { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 2px; white-space: pre-wrap; word-break: break-word; }",
			".mcp-toolServer { font-size: 10px; color: #60a5fa; margin-left: 4px; }",
			"@keyframes mcpSpin { to { transform: rotate(360deg) } }",
			".mcp-input { width: 100%; height: 28px; border-radius: 4px; border: 1px solid rgba(127,127,127,.25); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 8px; font-size: 12px; outline: none; }",
			".mcp-input:focus { border-color: rgba(127,127,127,.45); }",
			".mcp-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: .6; }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-mcp-sync-style")) return;
			var el = document.createElement("style");
			el.id = "dsh-mcp-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── tab content: servers ───────────── */

		function ServersTab() {
			var ref = useState(null);
			var data = ref[0], setData = ref[1];
			var ref2 = useState(true);
			var loading = ref2[0], setLoading = ref2[1];
			var ref3 = useState("");
			var error = ref3[0], setError = ref3[1];
			var ref4 = useState(false);
			var showAdd = ref4[0], setShowAdd = ref4[1];
			var ref5 = useState({ name: "", type: "stdio", command: "", args: "", url: "" });
			var form = ref5[0], setForm = ref5[1];
			var ref6 = useState("");
			var addError = ref6[0], setAddError = ref6[1];

			var fetchData = useCallback(async function() {
				try {
					setLoading(true);
					setError("");
					var result = await getJSON(API.servers);
					setData(result);
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, []);

			useEffect(function() { void fetchData(); }, [fetchData]);

			var handleAdd = useCallback(async function() {
				setAddError("");
				if (!form.name.trim()) { setAddError("请输入服务器名称"); return; }
				var config = { type: form.type };
				if (form.type === "stdio") {
					if (!form.command.trim()) { setAddError("请输入命令"); return; }
					config.command = form.command.trim();
					config.args = form.args.trim() ? form.args.trim().split(/\s+/) : [];
				} else {
					if (!form.url.trim()) { setAddError("请输入 URL"); return; }
					config.url = form.url.trim();
				}
				try {
					await postJSON(API.registry, { name: form.name.trim(), config: config });
					setShowAdd(false);
					setForm({ name: "", type: "stdio", command: "", args: "", url: "" });
					void fetchData();
				} catch (e) {
					setAddError(String(e.message || e));
				}
			}, [form, fetchData]);

			var handleDelete = useCallback(async function(name) {
				try {
					await fetch(API.registry + "?name=" + encodeURIComponent(name), { method: "DELETE" });
					void fetchData();
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [fetchData]);

			var servers = (data && data.servers) || [];
			var bySource = (data && data.bySource) || {};

			return h("div", null,
				h("div", { className: "mcp-stats" },
					Object.keys(SOURCE_META).map(function(id) {
						var meta = SOURCE_META[id];
						return h("span", { key: id },
							h("span", { className: "mcp-statDot", style: { background: meta.color } }),
							meta.label + ": " + (bySource[id] || 0)
						);
					}),
					h("span", null, "Total: " + ((data && data.total) || 0)),
					h("button", { className: "mcp-btn mcp-btn-primary", onClick: function() { setShowAdd(!showAdd); } }, showAdd ? "取消" : "+ 添加")
				),

				// 添加自定义 MCP 表单
				showAdd ? h("div", { style: { padding: "12px", borderBottom: "1px solid rgba(127,127,127,.15)" } },
					h("div", { style: { fontSize: 12, fontWeight: 600, marginBottom: 8 } }, "添加自定义 MCP 服务器"),
					addError ? h("div", { style: { fontSize: 11, color: "#f87171", marginBottom: 8 } }, addError) : null,
					h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
						h("input", { className: "mcp-input", placeholder: "名称 (如 my-server)", value: form.name, onChange: function(e) { setForm(function(prev) { return Object.assign({}, prev, { name: e.target.value }); }); } }),
						h("select", { className: "mcp-input", value: form.type, onChange: function(e) { setForm(function(prev) { return Object.assign({}, prev, { type: e.target.value }); }); } },
							h("option", { value: "stdio" }, "stdio (本地命令)"),
							h("option", { value: "sse" }, "sse (远程 URL)")
						),
						form.type === "stdio" ? h("div", { style: { display: "flex", gap: 6 } },
							h("input", { className: "mcp-input", placeholder: "命令 (如 npx)", value: form.command, onChange: function(e) { setForm(function(prev) { return Object.assign({}, prev, { command: e.target.value }); }); }, style: { flex: 1 } }),
							h("input", { className: "mcp-input", placeholder: "参数 (空格分隔)", value: form.args, onChange: function(e) { setForm(function(prev) { return Object.assign({}, prev, { args: e.target.value }); }); }, style: { flex: 2 } })
						) : h("input", { className: "mcp-input", placeholder: "URL (如 http://localhost:3001/sse)", value: form.url, onChange: function(e) { setForm(function(prev) { return Object.assign({}, prev, { url: e.target.value }); }); } }),
						h("button", { className: "mcp-btn mcp-btn-primary", onClick: handleAdd, style: { alignSelf: "flex-start" } }, "添加")
					)
				) : null,

				h("div", { className: "mcp-scroll" },
					error ? h("div", { className: "mcp-empty" }, "Load failed: " + error) :
					loading ? h("div", { className: "mcp-empty" }, h("span", { className: "mcp-loading" })) :
					servers.length === 0 ? h("div", { className: "mcp-empty" }, "No MCP configurations found") :
					servers.map(function(s) {
						var sources = s.sources || [s.source];
						return h("div", { key: s.name + ":" + s.source, className: "mcp-row" },
							h("div", { style: { display: "flex", alignItems: "center" } },
								h("span", { className: "mcp-rowName" }, s.name),
								h("span", { className: "mcp-rowSources" },
									sources.map(function(src) {
										var meta = SOURCE_META[src];
										return h("span", {
											key: src,
											className: "mcp-badge",
											style: { background: (meta && meta.color) || "#888" },
										}, (meta && meta.label) || src);
									})
								),
								s.source === "custom" || s.source === "registry" ? h("button", {
									className: "mcp-btn mcp-btn-danger",
									style: { marginLeft: "auto", fontSize: 10 },
									onClick: function() { handleDelete(s.name); }
								}, "删除") : null
							),
							h("div", { className: "mcp-rowMeta" },
								s.type === "stdio" ? s.command + " " + (s.args || []).join(" ") : s.url
							)
						);
					})
				)
			);
		}

		/* ───────────── tab content: connections ───────────── */

		function ConnectionsTab() {
			var ref = useState(null);
			var data = ref[0], setData = ref[1];
			var ref2 = useState(true);
			var loading = ref2[0], setLoading = ref2[1];
			var ref3 = useState("");
			var error = ref3[0], setError = ref3[1];

			var fetchData = useCallback(async function() {
				try {
					setLoading(true);
					setError("");
					var result = await getJSON(API.connections);
					setData(result);
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, []);

			useEffect(function() { void fetchData(); }, [fetchData]);

			var servers = (data && data.servers && data.servers.servers) || [];
			var status = (data && data.status) || {};

			return h("div", null,
				h("div", { className: "mcp-stats" },
					h("span", null, "Total: " + (status.total || 0)),
					h("span", null,
						h("span", { className: "mcp-statDot", style: { background: "#22c55e" } }),
						"Connected: " + (status.connected || 0)
					),
					h("span", null,
						h("span", { className: "mcp-statDot", style: { background: "#ef4444" } }),
						"Error: " + (status.error || 0)
					),
					h("span", null, "MCP Tools: " + (status.totalTools || 0))
				),
				h("div", { className: "mcp-scroll" },
					error ? h("div", { className: "mcp-empty" }, "Load failed: " + error) :
					loading ? h("div", { className: "mcp-empty" }, h("span", { className: "mcp-loading" })) :
					servers.length === 0 ? h("div", { className: "mcp-empty" }, "No MCP connections yet") :
					servers.map(function(s) {
						var stateInfo = STATE_META[s.state] || STATE_META.disconnected;
						return h("div", { key: s.id, className: "mcp-connRow" },
							h("span", { className: "mcp-connState", style: { background: stateInfo.color } }),
							h("div", { className: "mcp-connInfo" },
								h("div", { className: "mcp-connName" }, s.id),
								h("div", { className: "mcp-connDetail" },
									stateInfo.label + " \u2022 " + (s.tools ? s.tools.length : 0) + " tools" +
									(s.error ? " \u2014 " + s.error : "")
								)
							)
						);
					})
				)
			);
		}

		/* ───────────── tab content: tools ───────────── */

		function ToolsTab() {
			var ref = useState(null);
			var data = ref[0], setData = ref[1];
			var ref2 = useState(true);
			var loading = ref2[0], setLoading = ref2[1];

			var fetchData = useCallback(async function() {
				try {
					setLoading(true);
					var result = await getJSON(API.tools);
					setData(result);
				} catch (e) {
					setData(null);
				} finally {
					setLoading(false);
				}
			}, []);

			useEffect(function() { void fetchData(); }, [fetchData]);

			var servers = (data && data.servers) || [];
			var allTools = [];
			servers.forEach(function(s) {
				(s.tools || []).forEach(function(t) {
					allTools.push({ serverId: s.id, tool: t });
				});
			});

			return h("div", { className: "mcp-scroll" },
				loading ? h("div", { className: "mcp-empty" }, h("span", { className: "mcp-loading" })) :
				allTools.length === 0 ? h("div", { className: "mcp-empty" }, "No MCP tools discovered. Connect to an MCP server first.") :
				allTools.map(function(item) {
					return h("div", { key: item.serverId + "/" + item.tool.name, className: "mcp-toolRow" },
						h("span", { className: "mcp-toolName" }, item.tool.name),
						h("span", { className: "mcp-toolServer" }, "@ " + item.serverId),
						h("div", { className: "mcp-toolDesc" }, item.tool.description || "(no description)")
					);
				})
			);
		}

		/* ───────────── main panel ───────────── */

		var TABS = [
			{ id: "servers", label: "Servers" },
			{ id: "connections", label: "Connections" },
			{ id: "tools", label: "Tools" },
		];

		function McpPanel() {
			var ref = useState("servers");
			var tab = ref[0], setTab = ref[1];
			var ref2 = useState(0);
			var refreshKey = ref2[0], setRefreshKey = ref2[1];

			var tabContent = tab === "servers" ? h(ServersTab, { key: refreshKey }) :
				tab === "connections" ? h(ConnectionsTab, { key: refreshKey }) :
				h(ToolsTab, { key: refreshKey });

			return h("div", { className: "mcp-panel" },
				h("div", { className: "mcp-header" },
					h("span", { className: "mcp-title" }, "MCP Manager"),
					h("button", { className: "mcp-btn", onClick: function() { setRefreshKey(function(k) { return k + 1; }); } }, "Refresh")
				),
				h("div", { className: "mcp-tabs" },
					TABS.map(function(t) {
						return h("span", {
							key: t.id,
							className: "mcp-tab" + (tab === t.id ? " mcp-tab-active" : ""),
							onClick: function() { setTab(t.id); },
						}, t.label);
					})
				),
				tabContent
			);
		}

		/* ───────────── locale ───────────── */

		var NS = "settings.mcpSync";

		var zh = { nav: "MCP Manager" };
		var en = { nav: "MCP Manager" };

		/* ───────────── plugin entry ───────────── */

		var inject = ["slots", "locale"];

		function apply(ctx) {
			console.log("[mcp-sync] client init");
			injectStyles();
			ctx.effect(function() { return ctx.locale.register(NS, { zh: zh, en: en }); }, "mcp-sync: dictionaries");
			var t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", function() {
				return ctx.slots.register({
					name: "settings.section",
					id: "mcp-sync",
					order: 40,
					label: function() { return t("nav"); },
					locale: NS,
					inject: function() { return {}; },
				}, McpPanel);
			});
			console.log("[mcp-sync] settings page registered");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
