/**
 * dsh-plugin-ima-sync - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-plugin-ima-sync/client.js.
 * Registers a settings tab for IMA sync configuration.
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-ima-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { useState, useEffect, useCallback } = React;
		const h = React.createElement;

		/* ───────────── constants & helpers ───────────── */

		const API = {
			config: "/api/dsh-ima-sync/config",
			save: "/api/dsh-ima-sync/config",
			test: "/api/dsh-ima-sync/test",
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

		/* ───────────── styles ───────────── */

		const CSS = [
			".ims-section { margin-bottom: 24px; }",
			".ims-sectionTitle { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--dsw-alias-label-primary); }",
			".ims-field { margin-bottom: 12px; }",
			".ims-label { display: block; font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }",
			".ims-input { width: 100%; max-width: 400px; height: 32px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 13px; outline: none; }",
			".ims-input:focus { border-color: rgba(127,127,127,.45); }",
			".ims-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: .6; }",
			".ims-checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }",
			".ims-checkbox input[type='checkbox'] { width: 16px; height: 16px; cursor: pointer; }",
			".ims-checkbox input[type='radio'] { width: 14px; height: 14px; cursor: pointer; margin: 0; }",
			".ims-checkboxLabel { font-size: 13px; color: var(--dsw-alias-label-primary); }",
			".ims-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }",
			".ims-buttons { display: flex; gap: 8px; margin-top: 16px; }",
			".ims-btn { height: 32px; padding: 0 16px; border-radius: 6px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s; }",
			".ims-btn-primary { background: #3e84ff; color: #fff; }",
			".ims-btn-primary:hover { background: #2a6feb; }",
			".ims-btn-primary:disabled { background: rgba(62,132,255,.5); cursor: not-allowed; }",
			".ims-btn-secondary { background: rgba(127,127,127,.12); color: var(--dsw-alias-label-primary); }",
			".ims-btn-secondary:hover { background: rgba(127,127,127,.18); }",
			".ims-status { margin-top: 12px; padding: 10px; border-radius: 6px; font-size: 13px; }",
			".ims-status-success { background: rgba(52,199,89,.15); color: #34c759; }",
			".ims-status-error { background: rgba(255,59,48,.15); color: #ff3b30; }",
			".ims-toast { position: fixed; top: 20px; right: 20px; z-index: 10000; padding: 12px 20px; border-radius: 8px; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,.15); animation: imsToastIn .3s ease, imsToastOut .3s ease 2.7s; pointer-events: none; }",
			".ims-toast-success { background: #34c759; color: #fff; }",
			".ims-toast-error { background: #ff3b30; color: #fff; }",
			"@keyframes imsToastIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }",
			"@keyframes imsToastOut { from { opacity: 1; } to { opacity: 0; } }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-ima-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-ima-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── locale ───────────── */

		const NS = "settings.imaSync";

		const zh = {
			nav: "IMA 同步",
			tab: "IMA 同步",
			loading: "加载中...",
			loadError: "加载配置失败: ",
			saveSuccess: "配置已保存",
			saveError: "保存失败: ",
			testSuccess: "连接成功",
			testError: "连接失败: ",
			saving: "保存中...",
			save: "保存配置",
			testing: "测试中...",
			test: "测试连接",
			general: "基本设置",
			enable: "启用插件",
			enableHint: "禁用后插件完全不注册监听",
			mode: "笔记模式",
			modeProjectDate: "项目+日期",
			modeProjectDateDesc: "每个项目独立笔记：[项目名] YYYY-MM-DD",
			modeDaily: "每日日报",
			modeDailyDesc: "所有项目合并到一个日期笔记：YYYY-MM-DD",
			credentials: "IMA 凭证",
			credHint: "从 https://ima.qq.com/agent-interface 获取",
			useManual: "使用手动配置覆盖（优先级最高）",
			credMissing: "未检测到凭证，请勾选上方手动配置",
			credSource_manual: "凭证来自手动配置",
			credSource_config: "凭证来自本地配置",
			credSource_env: "凭证来自环境变量",
			credSource_file: "凭证来自本地文件",
			credSource_none: "未配置",
			clientId: "Client ID",
			apiKey: "API Key",
			workKbId: "Work 知识库 ID（可选）",
			manualHint: "手动配置将覆盖环境变量和本地文件",
			placeholderCred: "留空则读取环境变量或本地文件",
			placeholderKb: "留空则不关联知识库",
			projectKb: "项目知识库映射",
			projectKbHint: "为不同项目配置不同的 IMA 知识库 ID",
			projectName: "项目名",
			kbIdPlaceholder: "知识库 ID",
			add: "添加",
			delete: "删除",
			advanced: "高级设置",
			imaUploadBin: "ima-upload 脚本路径",
			imaUploadBinHint: "留空使用默认路径；脚本不存在时走直接 API",
			projectsFile: "项目映射文件",
			defaultProject: "默认项目名",
			defaultProjectHint: "留空使用目录名",
			placeholderBin: "~/.local/bin/ima-upload",
			placeholderProjects: "~/.config/ima/projects.json",
			placeholderDefault: "留空使用目录名",
			projects: "已检测项目",
			projectsHint: "自动从 Claude 会话目录检测，无需手动维护",
		};

		const en = {
			nav: "IMA Sync",
			tab: "IMA Sync",
			loading: "Loading...",
			loadError: "Failed to load config: ",
			saveSuccess: "Config saved",
			saveError: "Save failed: ",
			testSuccess: "Connection successful",
			testError: "Connection failed: ",
			saving: "Saving...",
			save: "Save Config",
			testing: "Testing...",
			test: "Test Connection",
			general: "General",
			enable: "Enable Plugin",
			enableHint: "When disabled, the plugin registers no listeners",
			mode: "Note Mode",
			modeProjectDate: "Project + Date",
			modeProjectDateDesc: "Separate note per project: [Project] YYYY-MM-DD",
			modeDaily: "Daily Report",
			modeDailyDesc: "All projects merged into one daily note: YYYY-MM-DD",
			credentials: "IMA Credentials",
			credHint: "Get from https://ima.qq.com/agent-interface",
			useManual: "Use manual override (highest priority)",
			credMissing: "No credentials detected, check manual override above",
			credSource_manual: "Credentials from manual config",
			credSource_config: "Credentials from local config",
			credSource_env: "Credentials from environment variables",
			credSource_file: "Credentials from local file",
			credSource_none: "Not configured",
			clientId: "Client ID",
			apiKey: "API Key",
			workKbId: "Work Knowledge Base ID (optional)",
			manualHint: "Manual config overrides env vars and local files",
			placeholderCred: "Leave empty to read from env or local file",
			placeholderKb: "Leave empty to skip knowledge base",
			projectKb: "Project Knowledge Base Mapping",
			projectKbHint: "Configure different IMA knowledge base IDs per project",
			projectName: "Project Name",
			kbIdPlaceholder: "Knowledge Base ID",
			add: "Add",
			delete: "Delete",
			advanced: "Advanced",
			imaUploadBin: "ima-upload Script Path",
			imaUploadBinHint: "Leave empty for default; falls back to API if missing",
			projectsFile: "Project Mapping File",
			defaultProject: "Default Project Name",
			defaultProjectHint: "Leave empty to use directory name",
			placeholderBin: "~/.local/bin/ima-upload",
			placeholderProjects: "~/.config/ima/projects.json",
			placeholderDefault: "Leave empty to use directory name",
			projects: "Detected Projects",
			projectsHint: "Auto-detected from Claude session directories, no manual maintenance needed",
		};

		/* ───────────── config panel component ───────────── */

		function ImaSyncSettings({ t }) {
			const [config, setConfig] = useState({
				enabled: true,
				mode: "project+date",
				clientId: "",
				apiKey: "",
				workKbId: "",
				workKbName: "",
				imaUploadBin: "",
				projectsFile: "",
				cacheDir: "",
				defaultProject: "",
				maxPromptLength: 300,
				maxDetailLength: 20000,
				timeoutMs: 120000,
				manualOverride: { clientId: "", apiKey: "", workKbId: "" },
				projectKnowledgeBases: {},
				hasCredentials: false,
				credentialSource: "none",
			});
			const [loading, setLoading] = useState(true);
			const [saving, setSaving] = useState(false);
			const [testing, setTesting] = useState(false);
			const [status, setStatus] = useState(null);
			const [projects, setProjects] = useState([]);
			const [knowledgeBases, setKnowledgeBases] = useState([]);
			const [useManualOverride, setUseManualOverride] = useState(false);
			const [newProjectName, setNewProjectName] = useState("");
			const [newProjectKbId, setNewProjectKbId] = useState("");
			const [toast, setToast] = useState(null);

			const showToast = useCallback((type, message) => {
				setToast({ type, message });
				setTimeout(() => setToast(null), 3000);
			}, []);

			useEffect(() => {
				(async () => {
					try {
						const [data, projData, kbData] = await Promise.all([
							getJSON(API.config),
							getJSON("/api/dsh-ima-sync/projects").catch(() => ({ projects: [] })),
							getJSON("/api/dsh-ima-sync/knowledge-bases").catch(() => ({ knowledgeBases: [] })),
						]);
						setConfig(data);
						setUseManualOverride(!!(data.manualOverride?.clientId || data.manualOverride?.apiKey));
						setProjects(projData.projects || []);
						setKnowledgeBases(kbData.knowledgeBases || []);
					} catch (err) {
						setStatus({ type: "error", message: t("loadError") + err.message });
					} finally {
						setLoading(false);
					}
				})();
			}, []);

			const handleChange = useCallback((field, value) => {
				setConfig(prev => ({ ...prev, [field]: value }));
			}, []);

			const handleManualOverrideChange = useCallback((field, value) => {
				setConfig(prev => ({
					...prev,
					manualOverride: { ...prev.manualOverride, [field]: value },
				}));
			}, []);

			const handleSave = useCallback(async () => {
				setSaving(true);
				try {
					const saveConfig = { ...config };
					// 不再清空 manualOverride，保留用户之前填的值
					await postJSON(API.save, saveConfig);
					showToast("success", t("saveSuccess"));
				} catch (err) {
					showToast("error", t("saveError") + err.message);
				} finally {
					setSaving(false);
				}
			}, [config, useManualOverride]);

			const handleTest = useCallback(async () => {
				setTesting(true);
				setStatus(null);
				try {
					const result = await postJSON(API.test, {});
					setStatus({ type: result.success ? "success" : "error", message: result.message });
				} catch (err) {
					setStatus({ type: "error", message: t("testError") + err.message });
				} finally {
					setTesting(false);
				}
			}, []);

			const handleUpdateProjectKb = useCallback((project, kbId) => {
				setConfig(prev => ({
					...prev,
					projectKnowledgeBases: { ...prev.projectKnowledgeBases, [project]: kbId },
				}));
			}, []);

			const handleRemoveProjectKb = useCallback((project) => {
				setConfig(prev => {
					const next = { ...prev.projectKnowledgeBases };
					delete next[project];
					return { ...prev, projectKnowledgeBases: next };
				});
			}, []);

			const handleAddProjectKb = useCallback(() => {
				if (!newProjectName.trim() || !newProjectKbId.trim()) return;
				setConfig(prev => ({
					...prev,
					projectKnowledgeBases: { ...prev.projectKnowledgeBases, [newProjectName.trim()]: newProjectKbId.trim() },
				}));
				setNewProjectName("");
				setNewProjectKbId("");
			}, [newProjectName, newProjectKbId]);

			if (loading) {
				return h("div", { style: { padding: "40px", textAlign: "center", color: "var(--dsw-alias-label-secondary)" } }, t("loading"));
			}

			return h("div", { style: { maxWidth: 760, padding: "0 0 24px" } },
				// Toast 通知
				toast ? h("div", { className: `ims-toast ims-toast-${toast.type}` }, toast.message) : null,
				status ? h("div", { className: "ims-status ims-status-" + status.type }, status.message) : null,

				// General
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, t("general")),
					h("label", { className: "ims-checkbox" },
						h("input", { type: "checkbox", checked: config.enabled, onChange: (e) => handleChange("enabled", e.target.checked) }),
						h("span", { className: "ims-checkboxLabel" }, t("enable")),
					),
					h("div", { className: "ims-hint" }, t("enableHint")),
					h("div", { style: { height: 12 } }),
					h("div", { className: "ims-label" }, t("mode")),
					h("label", { className: "ims-checkbox", style: { marginTop: 6 } },
						h("input", { type: "radio", name: "ima-mode", checked: config.mode === "project+date", onChange: () => handleChange("mode", "project+date") }),
						h("span", { className: "ims-checkboxLabel" }, t("modeProjectDate")),
					),
					h("div", { className: "ims-hint", style: { marginLeft: 24, marginTop: -2 } }, t("modeProjectDateDesc")),
					h("label", { className: "ims-checkbox", style: { marginTop: 6 } },
						h("input", { type: "radio", name: "ima-mode", checked: config.mode === "daily", onChange: () => handleChange("mode", "daily") }),
						h("span", { className: "ims-checkboxLabel" }, t("modeDaily")),
					),
					h("div", { className: "ims-hint", style: { marginLeft: 24, marginTop: -2 } }, t("modeDailyDesc")),
				),

				// Detected Projects
				projects.length > 0 ? h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, t("projects")),
					h("div", { className: "ims-hint", style: { marginBottom: 8 } }, t("projectsHint")),
					h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
						projects.map((p, i) =>
							h("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, fontSize: 13 } },
								h("span", { style: { color: "var(--dsw-alias-label-primary)", fontWeight: 500 } }, p.name),
								h("span", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: 11 } }, p.path),
								h("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 10, padding: "1px 4px", borderRadius: 3, background: "var(--dsw-alias-bg-elevated)" } }, p.source),
							)
						),
					),
				) : null,

				// Credentials
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, t("credentials")),
					h("div", { className: "ims-hint", style: { marginBottom: 12 } }, t("credHint")),
					h("label", { className: "ims-checkbox", style: { marginBottom: 12 } },
						h("input", { type: "checkbox", checked: useManualOverride, onChange: (e) => setUseManualOverride(e.target.checked) }),
						h("span", { className: "ims-checkboxLabel" }, t("useManual")),
					),
					useManualOverride ? null : h("div", null,
						config.hasCredentials
							? h("div", { className: "ims-hint", style: { marginBottom: 8, color: "#34c759", fontSize: 13 } },
								"✅ " + t("credSource_" + (config.credentialSource || "none")))
							: h("div", { className: "ims-hint", style: { marginBottom: 8, color: "#ff9500", fontSize: 13 } },
								"⚠️ " + t("credMissing")),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, t("workKbId")),
							knowledgeBases.length > 0
								? h("select", {
									className: "ims-input",
									value: config.workKbName || config.workKbId,
									onChange: (e) => {
										const selected = knowledgeBases.find(kb => kb.name === e.target.value);
										if (selected) {
											handleChange("workKbName", selected.name);
											handleChange("workKbId", selected.id);
										} else {
											handleChange("workKbName", "");
											handleChange("workKbId", "");
										}
									},
								},
									h("option", { value: "" }, t("placeholderKb")),
									knowledgeBases.map((kb) =>
										h("option", { key: kb.id, value: kb.name }, kb.name)
									),
								)
								: h("input", { className: "ims-input", type: "text", placeholder: t("placeholderKb"), value: config.workKbId, onChange: (e) => handleChange("workKbId", e.target.value) }),
						),
					),
					useManualOverride ? h("div", null,
						h("div", { className: "ims-hint", style: { marginBottom: 12 } }, t("manualHint")),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, t("clientId")),
							h("input", { className: "ims-input", type: "text", placeholder: t("clientId"), value: config.manualOverride.clientId, onChange: (e) => handleManualOverrideChange("clientId", e.target.value) }),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, t("apiKey")),
							h("input", { className: "ims-input", type: "password", placeholder: t("apiKey"), value: config.manualOverride.apiKey, onChange: (e) => handleManualOverrideChange("apiKey", e.target.value) }),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, t("workKbId")),
							h("input", { className: "ims-input", type: "text", placeholder: t("placeholderKb"), value: config.manualOverride.workKbId, onChange: (e) => handleManualOverrideChange("workKbId", e.target.value) }),
						),
					) : null,
				),

				// Project knowledge bases
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, t("projectKb")),
					h("div", { className: "ims-hint", style: { marginBottom: 12 } }, t("projectKbHint")),
					Object.entries(config.projectKnowledgeBases || {}).map(([project, kbId]) =>
						h("div", { key: project, className: "ims-field", style: { display: "flex", gap: 8, alignItems: "center" } },
							h("input", { className: "ims-input", type: "text", value: project, disabled: true, style: { flex: 1, maxWidth: 200 } }),
							h("input", { className: "ims-input", type: "text", value: kbId, onChange: (e) => handleUpdateProjectKb(project, e.target.value), placeholder: t("kbIdPlaceholder"), style: { flex: 1 } }),
							h("button", { className: "ims-btn ims-btn-secondary", onClick: () => handleRemoveProjectKb(project), style: { padding: "0 8px", height: 32 } }, t("delete")),
						)
					),
					h("div", { className: "ims-field", style: { display: "flex", gap: 8, alignItems: "center", marginTop: 12 } },
						h("input", { className: "ims-input", type: "text", value: newProjectName, onChange: (e) => setNewProjectName(e.target.value), placeholder: t("projectName"), style: { flex: 1, maxWidth: 200 } }),
						h("input", { className: "ims-input", type: "text", value: newProjectKbId, onChange: (e) => setNewProjectKbId(e.target.value), placeholder: t("kbIdPlaceholder"), style: { flex: 1 } }),
						h("button", { className: "ims-btn ims-btn-primary", onClick: handleAddProjectKb, disabled: !newProjectName.trim() || !newProjectKbId.trim(), style: { padding: "0 12px", height: 32 } }, t("add")),
					),
				),

				// Advanced
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, t("advanced")),
					h("div", { className: "ims-field" },
						h("label", { className: "ims-label" }, t("defaultProject")),
						h("input", { className: "ims-input", type: "text", placeholder: t("placeholderDefault"), value: config.defaultProject, onChange: (e) => handleChange("defaultProject", e.target.value) }),
						h("div", { className: "ims-hint" }, t("defaultProjectHint")),
					),
				),

				// Buttons
				h("div", { className: "ims-buttons" },
					h("button", { className: "ims-btn ims-btn-primary", onClick: handleSave, disabled: saving }, saving ? t("saving") : t("save")),
					h("button", { className: "ims-btn ims-btn-secondary", onClick: handleTest, disabled: testing }, testing ? t("testing") : t("test")),
				),
			);
		}

		/* ───────────── cordis plugin entry ───────────── */

		const inject = ["slots", "locale"];

		function apply(ctx) {
			console.log("[ima-sync] 客户端初始化");
			injectStyles();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ima-sync: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "ima-sync",
				order: 30,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({}),
			}, ImaSyncSettings));
			console.log("[ima-sync] 设置页注册完成");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
