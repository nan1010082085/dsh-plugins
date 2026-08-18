/**
 * dsh-mcp-sync - browser half (hand-written, zero-build).
 *
 * Registers a tab in dsh-better-sidebar showing MCP configurations
 * from Claude Code, Codex CLI, and Cursor Agent.
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

		const API = {
			servers: "/api/dsh-mcp-sync/servers",
			custom: "/api/dsh-mcp-sync/custom",
		};

		const SOURCE_META = {
			claude: { label: "Claude", color: "#d97757" },
			codex: { label: "Codex", color: "#10a37f" },
			cursor: { label: "Cursor", color: "#3ea8ff" },
			custom: { label: "自定义", color: "#a855f7" },
		};

		async function getJSON(url) {
			const res = await fetch(url, { headers: { accept: "application/json" } });
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error((body && body.error) || "HTTP " + res.status);
			return body;
		}

		/* ───────────── styles ───────────── */

		const CSS = [
			".mcp-panel { display: flex; flex-direction: column; height: 100%; font-family: var(--dsw-font-family); }",
			".mcp-header { padding: 10px 12px; border-bottom: 1px solid rgba(127,127,127,.15); display: flex; align-items: center; gap: 8px; }",
			".mcp-title { font-size: 14px; font-weight: 700; flex: 1; }",
			".mcp-btn { border: none; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 12px; }",
			".mcp-btn:hover { background: rgba(127,127,127,.1); }",
			".mcp-stats { padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.1); display: flex; gap: 12px; font-size: 11px; color: var(--dsw-alias-label-secondary); }",
			".mcp-statDot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 3px; vertical-align: middle; }",
			".mcp-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }",
			".mcp-row { padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.08); }",
			".mcp-row:last-child { border-bottom: none; }",
			".mcp-rowName { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }",
			".mcp-rowMeta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }",
			".mcp-rowSources { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }",
			".mcp-badge { font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; color: #fff; }",
			".mcp-empty { padding: 24px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 12px; }",
			".mcp-loading { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(127,127,127,.2); border-top-color: var(--dsw-alias-label-primary); border-radius: 50%; animation: mcpSpin .8s linear infinite; }",
			"@keyframes mcpSpin { to { transform: rotate(360deg) } }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-mcp-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-mcp-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── main component ───────────── */

		function McpPanel() {
			const [data, setData] = useState(null);
			const [loading, setLoading] = useState(true);
			const [error, setError] = useState("");

			const fetchData = useCallback(async () => {
				try {
					setLoading(true);
					setError("");
					const result = await getJSON(API.servers);
					setData(result);
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, []);

			useEffect(() => {
				void fetchData();
			}, [fetchData]);

			const servers = data?.servers || [];
			const bySource = data?.bySource || {};

			return h("div", { className: "mcp-panel" },
				h("div", { className: "mcp-header" },
					h("span", { className: "mcp-title" }, "MCP 配置"),
					h("button", { className: "mcp-btn", onClick: fetchData }, "刷新"),
				),
				data ? h("div", { className: "mcp-stats" },
					Object.entries(SOURCE_META).map(([id, meta]) =>
						h("span", { key: id },
							h("span", { className: "mcp-statDot", style: { background: meta.color } }),
							meta.label + ": " + (bySource[id] || 0),
						)
					),
					h("span", null, "共 " + (data.total || 0) + " 个"),
				) : null,
				h("div", { className: "mcp-scroll" },
					error ? h("div", { className: "mcp-empty" }, "加载失败: " + error) :
					loading ? h("div", { className: "mcp-empty" }, h("span", { className: "mcp-loading" })) :
					servers.length === 0 ? h("div", { className: "mcp-empty" }, "未发现 MCP 配置") :
					servers.map((s) => {
						const sources = s.sources || [s.source];
						return h("div", { key: s.name + ":" + s.source, className: "mcp-row" },
							h("span", { className: "mcp-rowName" }, s.name),
							h("span", { className: "mcp-rowSources" },
								sources.map((src) => {
									const meta = SOURCE_META[src];
									return h("span", {
										key: src,
										className: "mcp-badge",
										style: { background: meta?.color || "#888" },
									}, meta?.label || src);
								}),
							),
							h("div", { className: "mcp-rowMeta" },
								s.type === "stdio" ? s.command + " " + s.args.join(" ") : s.url
							),
						);
					}),
				),
			);
		}

		/* ───────────── plugin entry ───────────── */

		const inject = ["betterSidebar"];

		function apply(ctx) {
			injectStyles();

			const dispose = ctx.betterSidebar.registerTab({
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
				),
				order: 40,
				single: true,
				component: () => h(McpPanel),
			});

			ctx.effect(() => () => {
				dispose();
			}, "dsh-mcp-sync: sidebar tab");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
