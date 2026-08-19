/**
 * dsh-mcp-sync MCP Registry
 * 
 * 统一管理所有 MCP 服务器配置。同步来源只在首次导入时记录，
 * 导入后的配置是一等公民：可编辑、可删除、可直接调用。
 * 
 * 存储位置: ~/.dsh/mcp-registry.json
 * 格式: { "server-name": { type, command, args, env, url, ... } }
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import os from "node:os";

const REGISTRY_FILE = "mcp-registry.json";

/**
 * Get the registry file path.
 * @param {string} [home] - home directory override
 * @returns {string}
 */
export function getRegistryPath(home) {
  return join(home || os.homedir(), ".dsh", REGISTRY_FILE);
}

/**
 * Load the MCP registry.
 * @param {string} [home]
 * @returns {object} { "server-name": { type, command, args, env, url, ... }, ... }
 */
export function loadRegistry(home) {
  const path = getRegistryPath(home);
  try {
    const content = readFileSync(path, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Save the MCP registry.
 * @param {object} registry
 * @param {string} [home]
 */
export function saveRegistry(registry, home) {
  const path = getRegistryPath(home);
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(registry, null, 2), "utf8");
}

/**
 * Add or update a server in the registry.
 * @param {string} name - server name (unique id)
 * @param {object} config - MCP server config { type, command, args, env, url, ... }
 * @param {string} [home]
 * @returns {{ok: boolean, action: "added"|"updated"}}
 */
export function upsertServer(name, config, home) {
  const registry = loadRegistry(home);
  const action = registry[name] ? "updated" : "added";
  
  registry[name] = {
    type: config.type || "stdio",
    command: config.command || "",
    args: Array.isArray(config.args) ? config.args : [],
    env: config.env && typeof config.env === "object" ? config.env : {},
    url: config.url || "",
    // 保留其他字段
    ...(config.description ? { description: config.description } : {}),
    ...(config.enabled !== undefined ? { enabled: config.enabled } : {}),
  };
  
  saveRegistry(registry, home);
  return { ok: true, action };
}

/**
 * Remove a server from the registry.
 * @param {string} name
 * @param {string} [home]
 * @returns {{ok: boolean, found: boolean}}
 */
export function removeServer(name, home) {
  const registry = loadRegistry(home);
  const found = !!registry[name];
  
  if (found) {
    delete registry[name];
    saveRegistry(registry, home);
  }
  
  return { ok: true, found };
}

/**
 * Get a single server config.
 * @param {string} name
 * @param {string} [home]
 * @returns {object|null}
 */
export function getServer(name, home) {
  const registry = loadRegistry(home);
  return registry[name] || null;
}

/**
 * List all registered servers.
 * @param {string} [home]
 * @returns {{name: string, config: object}[]}
 */
export function listServers(home) {
  const registry = loadRegistry(home);
  return Object.entries(registry).map(([name, config]) => ({
    name,
    config,
  }));
}

/**
 * Import servers from external sources into the registry.
 * Existing servers are skipped (don't overwrite user customizations).
 * 
 * @param {object[]} servers - array of { name, source, type, command, args, env, url }
 * @param {string} [home]
 * @returns {{imported: number, skipped: number}}
 */
export function importServers(servers, home) {
  const registry = loadRegistry(home);
  let imported = 0;
  let skipped = 0;
  
  for (const server of servers) {
    const name = server.name;
    if (!name) continue;
    
    // Skip if already exists (don't overwrite user customizations)
    if (registry[name]) {
      skipped++;
      continue;
    }
    
    registry[name] = {
      type: server.type || "stdio",
      command: server.command || "",
      args: Array.isArray(server.args) ? server.args : [],
      env: server.env && typeof server.env === "object" ? server.env : {},
      url: server.url || "",
    };
    imported++;
  }
  
  saveRegistry(registry, home);
  return { imported, skipped };
}
