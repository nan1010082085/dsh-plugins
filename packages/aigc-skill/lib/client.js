/**
 * dsh-plugin-aigc-skill - browser half (hand-written, zero-build).
 *
 * Loaded by the dsh web shell at /plugins/dsh-plugin-aigc-skill/client.js.
 * Registers a settings section: AIGC 技能套件（skill 清单 / 文档浏览 / 闸门状态 / 配置）。
 */
window.__ModuleLoader__.load({
	id: "dsh-plugin-aigc-skill",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const { useState, useEffect, useCallback } = React;
		const h = React.createElement;

		/* ───────────── constants & helpers ───────────── */

		const API = {
			overview: "/api/dsh-aigc-skill/overview",
			skill: "/api/dsh-aigc-skill/skill",
			file: "/api/dsh-aigc-skill/file",
			config: "/api/dsh-aigc-skill/config",
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
			".ais-section { margin-bottom: 24px; }",
			".ais-sectionTitle { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--dsw-alias-label-primary); }",
			".ais-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }",
			".ais-cat { margin-bottom: 14px; }",
			".ais-catTitle { font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .4px; }",
			".ais-chips { display: flex; flex-wrap: wrap; gap: 6px; }",
			".ais-chip { padding: 4px 10px; border-radius: 12px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); font-size: 12px; cursor: pointer; }",
			".ais-chip:hover { border-color: rgba(62,132,255,.5); }",
			".ais-chip-active { background: #3e84ff; color: #fff; border-color: #3e84ff; }",
			".ais-doc { max-height: 420px; overflow: auto; padding: 12px; border-radius: 8px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.2)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.05)); font-size: 12px; line-height: 1.7; white-space: pre-wrap; word-break: break-word; color: var(--dsw-alias-label-primary); }",
			".ais-table { width: 100%; border-collapse: collapse; font-size: 12px; }",
			".ais-table td { padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border, rgba(127,127,127,.15)); color: var(--dsw-alias-label-primary); }",
			".ais-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; }",
			".ais-badge-ok { background: rgba(52,199,89,.15); color: #34c759; }",
			".ais-badge-missing { background: rgba(255,59,48,.15); color: #ff3b30; }",
			".ais-label { display: block; font-size: 12px; color: var(--dsw-alias-label-secondary); margin-bottom: 4px; }",
			".ais-select { height: 32px; border-radius: 6px; border: 1px solid var(--dsw-alias-border, rgba(127,127,127,.25)); background: var(--dsw-alias-bg-elevated, rgba(127,127,127,.06)); color: var(--dsw-alias-label-primary); padding: 0 10px; font-size: 13px; min-width: 240px; }",
			".ais-buttons { display: flex; gap: 8px; margin-top: 16px; }",
			".ais-btn { height: 32px; padding: 0 16px; border-radius: 6px; border: none; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s; }",
			".ais-btn-primary { background: #3e84ff; color: #fff; }",
			".ais-btn-primary:hover { background: #2a6feb; }",
			".ais-btn-primary:disabled { background: rgba(62,132,255,.5); cursor: not-allowed; }",
			".ais-status { margin-top: 12px; padding: 10px; border-radius: 6px; font-size: 13px; }",
			".ais-status-success { background: rgba(52,199,89,.15); color: #34c759; }",
			".ais-status-error { background: rgba(255,59,48,.15); color: #ff3b30; }",
			".ais-desc { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.6; }",
		].join("\n");

		function injectStyles() {
			if (document.getElementById("dsh-aigc-skill-style")) return;
			const el = document.createElement("style");
			el.id = "dsh-aigc-skill-style";
			el.textContent = CSS;
			document.head.appendChild(el);
		}

		/* ───────────── locale ───────────── */

		const NS = "settings.aigcSkill";

		const zh = {
			nav: "AIGC 技能",
			title: "AIGC 漫剧技能套件",
			subtitle: "18 个创作 skill + 规则词典 + 机器闸门，随插件包分发（一次性取材自 aigc-suite-skills，与其他 Claude 安装 / WorkBuddy 专家团互不影响）",
			loading: "加载中...",
			loadError: "加载失败: ",
			pipeline: "流水线：剧本 → 素材 → 分镜 → 出片质检",
			cat_script: "剧本",
			cat_asset: "素材资产",
			cat_storyboard: "分镜",
			cat_execute: "执行",
			cat_qa: "质检",
			cat_style: "风格（一部剧锁 1 种）",
			cat_other: "其他",
			skillDocs: "技能文档",
			skillDocsHint: "点选 skill 查看 SKILL.md 全文（只读，来自插件包内部）",
			selectSkill: "选择一个 skill 查看文档",
			gates: "机器闸门（tools/）",
			gatesHint: "闸门脚本随插件包分发，供创作流程预检使用",
			available: "可用",
			missing: "缺失",
			shared: "规则词典（shared/）",
			settings: "设置",
			defaultStyle: "默认风格 skill",
			defaultStyleHint: "一部剧锁定 1 种风格；留空表示未锁定",
			none: "（未锁定）",
			save: "保存配置",
			saving: "保存中...",
			saveSuccess: "配置已保存",
			saveError: "保存失败: ",
		};

		const en = {
			nav: "AIGC Skills",
			title: "AIGC Drama Skill Suite",
			subtitle: "18 creation skills + rule dictionary + machine gates, shipped inside the plugin package (one-time copy from aigc-suite-skills; independent from other Claude installs and the WorkBuddy expert team)",
			loading: "Loading...",
			loadError: "Load failed: ",
			pipeline: "Pipeline: Script → Assets → Storyboard → QA",
			cat_script: "Script",
			cat_asset: "Assets",
			cat_storyboard: "Storyboard",
			cat_execute: "Execute",
			cat_qa: "QA",
			cat_style: "Style (lock 1 per drama)",
			cat_other: "Other",
			skillDocs: "Skill Docs",
			skillDocsHint: "Click a skill to view its SKILL.md (read-only, from inside the plugin package)",
			selectSkill: "Select a skill to view its doc",
			gates: "Machine Gates (tools/)",
			gatesHint: "Gate scripts ship with the plugin package for pre-generation checks",
			available: "available",
			missing: "missing",
			shared: "Rule Dictionary (shared/)",
			settings: "Settings",
			defaultStyle: "Default style skill",
			defaultStyleHint: "Lock 1 style per drama; empty means unlocked",
			none: "(unlocked)",
			save: "Save",
			saving: "Saving...",
			saveSuccess: "Configuration saved",
			saveError: "Save failed: ",
		};

		/* ───────────── panel component ───────────── */

		function AigcSkillSettings() {
			const [t, setT] = useState(() => (key) => zh[key] || key);
			const [overview, setOverview] = useState(null);
			const [error, setError] = useState("");
			const [activeSkill, setActiveSkill] = useState(null);
			const [doc, setDoc] = useState(null);
			const [defaultStyle, setDefaultStyle] = useState("");
			const [saving, setSaving] = useState(false);
			const [status, setStatus] = useState(null);

			useEffect(() => {
				try {
					const locale = window.__dsh_locale__ || (typeof navigator !== "undefined" ? navigator.language : "zh");
					const dict = String(locale).toLowerCase().startsWith("zh") ? zh : en;
					setT(() => (key) => dict[key] || key);
				} catch {}
			}, []);

			useEffect(() => {
				let cancelled = false;
				(async () => {
					try {
						const data = await getJSON(API.overview);
						if (cancelled) return;
						setOverview(data);
						setDefaultStyle(data.defaultStyle || "");
					} catch (err) {
						if (!cancelled) setError(String(err.message || err));
					}
				})();
				return () => { cancelled = true; };
			}, []);

			const openSkill = useCallback(async (dir) => {
				setActiveSkill(dir);
				setDoc(null);
				try {
					const data = await getJSON(API.skill + "?name=" + encodeURIComponent(dir));
					setDoc(data);
				} catch (err) {
					setDoc({ content: t("loadError") + err.message });
				}
			}, [t]);

			const handleSave = useCallback(async () => {
				setSaving(true);
				setStatus(null);
				try {
					await postJSON(API.config, { defaultStyle });
					setStatus({ ok: true, text: t("saveSuccess") });
				} catch (err) {
					setStatus({ ok: false, text: t("saveError") + err.message });
				} finally {
					setSaving(false);
				}
			}, [defaultStyle, t]);

			if (error) {
				return h("div", { className: "ais-section" },
					h("div", { className: "ais-status ais-status-error" }, t("loadError") + error),
				);
			}
			if (!overview) {
				return h("div", { className: "ais-section" }, t("loading"));
			}

			const styleSkills = (overview.skills.style || []).map((m) => m.dir);

			return h("div", null,
				// Header
				h("div", { className: "ais-section" },
					h("div", { className: "ais-sectionTitle" }, t("title")),
					h("div", { className: "ais-desc" }, t("subtitle")),
					h("div", { className: "ais-hint" }, t("pipeline") + " | " + overview.total + " skills"),
				),

				// Skill docs
				h("div", { className: "ais-section" },
					h("div", { className: "ais-sectionTitle" }, t("skillDocs")),
					h("div", { className: "ais-hint", style: { marginBottom: 10 } }, t("skillDocsHint")),
					(overview.categoryOrder || []).map((cat) => {
						const list = overview.skills[cat] || [];
						if (!list.length) return null;
						return h("div", { key: cat, className: "ais-cat" },
							h("div", { className: "ais-catTitle" }, t("cat_" + cat) || cat),
							h("div", { className: "ais-chips" },
								list.map((m) =>
									h("span", {
										key: m.dir,
										className: "ais-chip" + (activeSkill === m.dir ? " ais-chip-active" : ""),
										onClick: () => openSkill(m.dir),
										title: m.description,
									}, m.dir)
								),
							),
						);
					}),
					h("div", { style: { marginTop: 10 } },
						doc
							? h("div", { className: "ais-doc" }, doc.content)
							: h("div", { className: "ais-hint" }, t("selectSkill")),
					),
				),

				// Gates
				h("div", { className: "ais-section" },
					h("div", { className: "ais-sectionTitle" }, t("gates")),
					h("div", { className: "ais-hint", style: { marginBottom: 10 } }, t("gatesHint")),
					h("table", { className: "ais-table" },
						h("tbody", null,
							(overview.gates || []).map((g) =>
								h("tr", { key: g.file },
									h("td", null, g.file),
									h("td", { className: "ais-desc" }, g.role),
									h("td", null,
										h("span", { className: "ais-badge " + (g.available ? "ais-badge-ok" : "ais-badge-missing") },
											g.available ? t("available") : t("missing"),
										),
									),
								)
							),
						),
					),
				),

				// Shared files
				h("div", { className: "ais-section" },
					h("div", { className: "ais-sectionTitle" }, t("shared")),
					h("div", { className: "ais-chips" },
						(overview.shared || []).map((f) =>
							h("span", { key: f, className: "ais-chip" }, f)
						),
					),
				),

				// Settings
				h("div", { className: "ais-section" },
					h("div", { className: "ais-sectionTitle" }, t("settings")),
					h("div", null,
						h("label", { className: "ais-label" }, t("defaultStyle")),
						h("select", { className: "ais-select", value: defaultStyle, onChange: (e) => setDefaultStyle(e.target.value) },
							h("option", { value: "" }, t("none")),
							styleSkills.map((dir) => h("option", { key: dir, value: dir }, dir)),
						),
						h("div", { className: "ais-hint" }, t("defaultStyleHint")),
					),
					h("div", { className: "ais-buttons" },
						h("button", { className: "ais-btn ais-btn-primary", onClick: handleSave, disabled: saving },
							saving ? t("saving") : t("save"),
						),
					),
					status && h("div", { className: "ais-status " + (status.ok ? "ais-status-success" : "ais-status-error") }, status.text),
				),
			);
		}

		/* ───────────── cordis plugin entry ───────────── */

		const inject = ["slots", "locale"];

		function apply(ctx) {
			console.log("[aigc-skill] 客户端初始化");
			injectStyles();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "aigc-skill: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "aigc-skill",
				order: 40,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({}),
			}, AigcSkillSettings));
			console.log("[aigc-skill] 设置页注册完成");
		}

		exports.NS = NS;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
