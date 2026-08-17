/**
 * Browser-half load smoke test: emulate the dsh ModuleLoader contract with
 * stub React/DOM, execute the factory, run apply(), assert the mount wiring.
 *
 * Run: node tests/client-load.mjs
 */
import { readFileSync } from "node:fs";

let failed = 0;
const check = (name, ok, extra) => {
  if (!ok) failed += 1;
  console.log((ok ? "PASS" : "FAIL") + " " + name + (extra ? " :: " + extra : ""));
};

/* stub DOM */
const makeEl = () => ({
  dataset: {},
  style: {},
  children: [],
  setAttribute() {}, removeAttribute() {},
  addEventListener() {}, removeEventListener() {},
  appendChild(c) { this.children.push(c); return c; },
  insertBefore(c) { this.children.push(c); return c; },
  remove() {},
  observe() {},
});
globalThis.document = {
  head: makeEl(),
  documentElement: makeEl(),
  getElementById: () => null,
  createElement: () => makeEl(),
  querySelector: () => null,
};
globalThis.MutationObserver = class { observe() {} disconnect() {} };
globalThis.window = globalThis;
globalThis.addEventListener = globalThis.addEventListener ?? (() => {});
globalThis.removeEventListener = globalThis.removeEventListener ?? (() => {});
globalThis.dispatchEvent = globalThis.dispatchEvent ?? (() => true);
globalThis.CustomEvent = globalThis.CustomEvent ?? class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

/* stub react */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (v) => [v, () => {}],
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
};
const reactDomClient = { createRoot: () => ({ render() {}, unmount() {} }) };
const require2 = (name) => {
  if (name === "react") return React;
  if (name === "react-dom/client") return reactDomClient;
  throw new Error("unexpected require: " + name);
};

const registry = {};
globalThis.__ModuleLoader__ = {
  load(mod) {
    registry[mod.id] = mod.factory(require2);
  },
};

const code = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
try {
  (0, eval)(code);
  check("factory evaluated without throwing", true);
} catch (e) {
  check("factory evaluated without throwing", false, e.message);
  process.exit(1);
}
check("registered as dsh-chat-sync", "dsh-chat-sync" in registry);
const plugin = registry["dsh-chat-sync"];
check("exports apply + inject", typeof plugin.apply === "function" && Array.isArray(plugin.inject), "inject=" + JSON.stringify(plugin.inject));

let effectRan = false;
try {
  plugin.apply({ effect(fn) { effectRan = true; const dispose = fn(); check("effect disposer callable", typeof dispose === "function"); return dispose; } });
  check("apply() runs clean on stub ctx", true);
} catch (e) {
  check("apply() runs clean on stub ctx", false, e.stack);
}
check("ctx.effect was used", effectRan);
check("style injected once", document.head.children.length === 1 && document.head.children[0].id === "dsh-chat-sync-style");

console.log(failed === 0 ? "CLIENT LOAD OK" : "CLIENT LOAD FAILED: " + failed);
process.exit(failed === 0 ? 0 : 1);
