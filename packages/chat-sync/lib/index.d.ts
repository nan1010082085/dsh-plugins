/** dsh-chat-sync host-half type surface. */
import type { Context } from "@deepseek-ai/cordis";

export const name: "chat-sync";
export const inject: ["webServer", "apiProxy"];
export const Config: import("@deepseek-ai/schemastery").default<object>;
export function apply(ctx: Context, config?: Record<string, unknown>): void;

export interface ChatSyncSession {
  id: string;
  localId: string;
  source: "claude" | "codex" | "cursor";
  title: string;
  project: string;
  cwd: string;
  file: string;
  startedAt: number;
  updatedAt: number;
  size: number;
  live?: boolean;
}

export interface ChatSyncMessage {
  seq: number;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  toolUses?: { name: string; input: string }[];
  toolUseId?: string;
  name?: string;
  model?: string;
  isError?: boolean;
  ts?: number;
}