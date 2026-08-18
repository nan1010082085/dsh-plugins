/**
 * dsh-plugin-ima-sync - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-plugin-ima-sync/client.js and
 * materialized through window.__ModuleLoader__. Mounts a sidebar entry and
 * a center-column panel for configuring IMA sync settings.
 */
window.__ModuleLoader__.load({
	id: "dsh-ima-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { createRoot } = require("react-dom/client");
		const { useState, useEffect, useRef, useCallback } = React;
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

		/* ───────────── panel controller ───────────── */

		const OTHER_PANEL_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active", "data-dsh-chatsync-active"];
		const ACTIVATE_EVENT = "dsh-panel-activate";

		class PanelController {
			constructor() {
				this.panelOpen = false;
				this.listeners = new Set();
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
				root.setAttribute("data-dsh-imasync-active", "");
				for (const attr of OTHER_PANEL_ATTRS) root.removeAttribute(attr);
				window.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: "imasync" }));
				this.notify();
			}
			close() {
				if (!this.panelOpen) return;
				this.panelOpen = false;
				document.documentElement.removeAttribute("data-dsh-imasync-active");
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
			/* center-column takeover */
			"[data-pane='conversation'], [class*='centerCol'] { position: relative; }",
			"[data-dsh-imasync-view] { position: absolute; inset: 0; display: none; z-index: 60; background: var(--dsw-alias-bg-base); }",
			"html[data-dsh-imasync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]):not([data-dsh-chatsync-active]) [data-dsh-imasync-view] { display: block; }",
			"html[data-dsh-imasync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]):not([data-dsh-chatsync-active]) [data-pane='conversation'] > :not([data-dsh-imasync-view]),",
			"html[data-dsh-imasync-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]):not([data-dsh-chatsync-active]) [class*='centerCol'] > :not([data-dsh-imasync-view]) { display: none !important; }",

			/* sidebar entry */
			".ims-entry { display: flex; align-items: center; gap: 8px; width: 100%; height: 32px; padding: 0 12px; background: transparent; border: none; border-radius: 8px; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; white-space: nowrap; }",
			".ims-entry:hover { background: var(--dsw-specific-sidebar-nav-item-hover, rgba(127,127,127,.12)); color: var(--dsw-alias-label-primary); }",
			".ims-entry[data-active] { background: var(--dsw-specific-sidebar-nav-item-active, rgba(127,127,127,.16)); color: var(--dsw-alias-label-primary); font-weight: 600; }",
			".ims-entryIcon { display: inline-flex; align-items: center; justify-content: center; flex: none; }",
			".ims-entryLabel { overflow: hidden; text-overflow: ellipsis; }",
			"[data-dsh-frame][data-sidebar-collapsed] .ims-entry { justify-content: center; padding: 0; }",
			"[data-dsh-frame][data-sidebar-collapsed] .ims-entryLabel { display: none; }",

			/* panel frame */
			".ims-panel { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family); padding: 20px; overflow-y: auto; }",
			".ims-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }",
			".ims-section { margin-bottom: 24px; }",
			".ims-sectionTitle { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--dsw-alias-label-primary); }",
			".ims-field { margin-bottom: 12px; }",
			".ims-label { display: block; font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }",
			".ims-input { width: 100%; max-width: 400px; height: 32px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 13px; outline: none; }",
			".ims-input:focus { border-color: rgba(127,127,127,.45); }",
			".ims-input::placeholder { color: var(--dsw-alias-label-secondary); opacity: .6; }",
			".ims-textarea { width: 100%; max-width: 400px; min-height: 60px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 8px 10px; font-size: 13px; outline: none; resize: vertical; }",
			".ims-textarea:focus { border-color: rgba(127,127,127,.45); }",
			".ims-checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; }",
			".ims-checkbox input { width: 16px; height: 16px; cursor: pointer; }",
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
			".ims-status-info { background: rgba(62,132,255,.15); color: #3e84ff; }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-ima-sync-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-ima-sync-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── sidebar entry ───────────── */

		const ENTRY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h12v8H2z"/><path d="M2 4l6 5 6-5"/><path d="M4 10h3"/><path d="M4 12h5"/></svg>';

		function sidebarRoot() {
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
			if (!column) return undefined;
			const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
			return logoOwner ?? column.firstElementChild ?? undefined;
		}

		function mountSidebarEntry(controller) {
			if (document.querySelector("[data-dsh-imasync-entry]") !== null) return () => {};
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshImasyncEntry = "";
			entry.className = "ims-entry";
			entry.setAttribute("aria-label", "IMA 同步配置");
			entry.title = "配置 IMA 同步设置";
			entry.innerHTML = '<span class="ims-entryIcon">' + ENTRY_ICON + '</span><span class="ims-entryLabel">IMA 配置</span>';
			entry.addEventListener("click", () => controller.toggle());

			let rootObserver;
			let placed = false;
			const syncActive = () => {
				entry.setAttribute("data-active", controller.panelOpen ? "1" : "0");
			};
			controller.subscribe(syncActive);

			const tryPlace = () => {
				if (placed && !document.body.contains(entry)) {
					if (rootObserver) rootObserver.disconnect();
					placed = false;
				}
				if (placed) return;
				const root = sidebarRoot();
				if (!root) return;
				if (entry.isConnected) { placed = true; return; }
				let anchor = root.querySelector('button[class*="newSession"]');
				if (!anchor) {
					for (const child of root.children) if (child.tagName === "BUTTON") { anchor = child; break; }
				}
				const row = anchor ? anchor.closest('[class*="logoRow"]') : null;
				const base = row && row.parentElement === root ? row : anchor;
				const ref = base ? base.nextElementSibling : null;
				if (ref) root.insertBefore(entry, ref);
				else root.appendChild(entry);
				placed = true;
				rootObserver = new MutationObserver(tryPlace);
				rootObserver.observe(root, { childList: true, subtree: true });
			};

			const waitObserver = new MutationObserver(tryPlace);
			waitObserver.observe(document.body, { childList: true, subtree: true });
			tryPlace();
			return () => {
				waitObserver.disconnect();
				if (rootObserver) rootObserver.disconnect();
				entry.remove();
			};
		}

		/* ───────────── React: config panel ───────────── */

		function ConfigPanel() {
			const [config, setConfig] = useState({
				enabled: true,
				triggerOnTurnEnd: true,
				triggerOnSessionEnd: true,
				clientId: "",
				apiKey: "",
				workKbId: "",
				imaUploadBin: "",
				projectsFile: "",
				cacheDir: "",
				defaultProject: "",
				maxPromptLength: 300,
				maxDetailLength: 20000,
				timeoutMs: 120000,
				manualOverride: {
					clientId: "",
					apiKey: "",
					workKbId: "",
				},
			});
			const [loading, setLoading] = useState(true);
			const [saving, setSaving] = useState(false);
			const [testing, setTesting] = useState(false);
			const [status, setStatus] = useState(null);
			const [useManualOverride, setUseManualOverride] = useState(false);

			// Load config on mount
			useEffect(() => {
				(async () => {
					try {
						const data = await getJSON(API.config);
						setConfig(data);
						setUseManualOverride(!!(data.manualOverride?.clientId || data.manualOverride?.apiKey));
					} catch (err) {
						setStatus({ type: "error", message: "加载配置失败: " + err.message });
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
				setStatus(null);
				try {
					const saveConfig = { ...config };
					if (!useManualOverride) {
						saveConfig.manualOverride = { clientId: "", apiKey: "", workKbId: "" };
					}
					await postJSON(API.save, saveConfig);
					setStatus({ type: "success", message: "配置已保存" });
				} catch (err) {
					setStatus({ type: "error", message: "保存失败: " + err.message });
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
					setStatus({ type: "error", message: "测试失败: " + err.message });
				} finally {
					setTesting(false);
				}
			}, []);

			if (loading) {
				return h("div", { className: "ims-panel" },
					h("div", { style: { textAlign: "center", padding: "40px", color: "var(--dsw-alias-label-secondary)" } }, "加载中...")
				);
			}

			return h("div", { className: "ims-panel" },
				h("div", { className: "ims-title" }, "IMA 同步配置"),

				// Status message
				status ? h("div", { className: "ims-status ims-status-" + status.type }, status.message) : null,

				// General settings
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, "基本设置"),
					h("label", { className: "ims-checkbox" },
						h("input", {
							type: "checkbox",
							checked: config.enabled,
							onChange: (e) => handleChange("enabled", e.target.checked),
						}),
						h("span", { className: "ims-checkboxLabel" }, "启用插件"),
					),
					h("div", { className: "ims-hint" }, "禁用后插件完全不注册监听"),
					h("div", { style: { height: "8px" } }),
					h("label", { className: "ims-checkbox" },
						h("input", {
							type: "checkbox",
							checked: config.triggerOnTurnEnd,
							onChange: (e) => handleChange("triggerOnTurnEnd", e.target.checked),
						}),
						h("span", { className: "ims-checkboxLabel" }, "每轮对话结束时上传进度"),
					),
					h("div", { style: { height: "8px" } }),
					h("label", { className: "ims-checkbox" },
						h("input", {
							type: "checkbox",
							checked: config.triggerOnSessionEnd,
							onChange: (e) => handleChange("triggerOnSessionEnd", e.target.checked),
						}),
						h("span", { className: "ims-checkboxLabel" }, "会话销毁时上传总结"),
					),
				),

				// Credential settings
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, "IMA 凭证"),
					h("div", { className: "ims-hint", marginBottom: "12px" }, "从 https://ima.qq.com/agent-interface 获取"),

					// Manual override toggle
					h("label", { className: "ims-checkbox", marginBottom: "12px" },
						h("input", {
							type: "checkbox",
							checked: useManualOverride,
							onChange: (e) => setUseManualOverride(e.target.checked),
						}),
						h("span", { className: "ims-checkboxLabel" }, "使用手动配置覆盖（优先级最高）"),
					),

					// Direct config fields
					useManualOverride ? null : h("div", null,
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "Client ID"),
							h("input", {
								className: "ims-input",
								type: "text",
								placeholder: "留空则读取环境变量或本地文件",
								value: config.clientId,
								onChange: (e) => handleChange("clientId", e.target.value),
							}),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "API Key"),
							h("input", {
								className: "ims-input",
								type: "password",
								placeholder: "留空则读取环境变量或本地文件",
								value: config.apiKey,
								onChange: (e) => handleChange("apiKey", e.target.value),
							}),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "Work 知识库 ID（可选）"),
							h("input", {
								className: "ims-input",
								type: "text",
								placeholder: "留空则不关联知识库",
								value: config.workKbId,
								onChange: (e) => handleChange("workKbId", e.target.value),
							}),
						),
					),

					// Manual override fields
					useManualOverride ? h("div", null,
						h("div", { className: "ims-hint", marginBottom: "12px" }, "手动配置将覆盖环境变量和本地文件"),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "Client ID"),
							h("input", {
								className: "ims-input",
								type: "text",
								placeholder: "输入 Client ID",
								value: config.manualOverride.clientId,
								onChange: (e) => handleManualOverrideChange("clientId", e.target.value),
							}),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "API Key"),
							h("input", {
								className: "ims-input",
								type: "password",
								placeholder: "输入 API Key",
								value: config.manualOverride.apiKey,
								onChange: (e) => handleManualOverrideChange("apiKey", e.target.value),
							}),
						),
						h("div", { className: "ims-field" },
							h("label", { className: "ims-label" }, "Work 知识库 ID（可选）"),
							h("input", {
								className: "ims-input",
								type: "text",
								placeholder: "留空则不关联知识库",
								value: config.manualOverride.workKbId,
								onChange: (e) => handleManualOverrideChange("workKbId", e.target.value),
							}),
						),
					) : null,
				),

				// Advanced settings
				h("div", { className: "ims-section" },
					h("div", { className: "ims-sectionTitle" }, "高级设置"),
					h("div", { className: "ims-field" },
						h("label", { className: "ims-label" }, "ima-upload 脚本路径"),
						h("input", {
							className: "ims-input",
							type: "text",
							placeholder: "~/.local/bin/ima-upload",
							value: config.imaUploadBin,
							onChange: (e) => handleChange("imaUploadBin", e.target.value),
						}),
						h("div", { className: "ims-hint" }, "留空使用默认路径；脚本不存在时走直接 API"),
					),
					h("div", { className: "ims-field" },
						h("label", { className: "ims-label" }, "项目映射文件"),
						h("input", {
							className: "ims-input",
							type: "text",
							placeholder: "~/.config/ima/projects.json",
							value: config.projectsFile,
							onChange: (e) => handleChange("projectsFile", e.target.value),
						}),
					),
					h("div", { className: "ims-field" },
						h("label", { className: "ims-label" }, "默认项目名"),
						h("input", {
							className: "ims-input",
							type: "text",
							placeholder: "留空使用目录名",
							value: config.defaultProject,
							onChange: (e) => handleChange("defaultProject", e.target.value),
						}),
					),
				),

				// Buttons
				h("div", { className: "ims-buttons" },
					h("button", {
						className: "ims-btn ims-btn-primary",
						onClick: handleSave,
						disabled: saving,
					}, saving ? "保存中..." : "保存配置"),
					h("button", {
						className: "ims-btn ims-btn-secondary",
						onClick: handleTest,
						disabled: testing,
					}, testing ? "测试中..." : "测试连接"),
				),
			);
		}

		/* ───────────── mount ───────────── */

		injectStyles();

		const controller = new PanelController();
		const cleanupSidebar = mountSidebarEntry(controller);

		// Mount the panel view
		const viewHost = document.createElement("div");
		viewHost.dataset.dshImasyncView = "";
		const viewRoot = createRoot(viewHost);

		controller.onOpen = () => {
			const centerCol = document.querySelector("[data-pane='conversation'], [class*='centerCol']");
			if (centerCol && !centerCol.contains(viewHost)) {
				centerCol.appendChild(viewHost);
			}
			viewRoot.render(h(ConfigPanel));
		};
		controller.onClose = () => {
			viewRoot.render(null);
		};

		// Listen for other panels
		window.addEventListener(ACTIVATE_EVENT, (e) => {
			if (e.detail !== "imasync") controller.close();
		});

		module.exports = { controller, cleanupSidebar };
	},
});