/**
 * dsh-plugin-ima-sync — 将 DSH 对话进度自动上传到腾讯 IMA。
 */
import type { Context } from '@deepseek-ai/cordis';


export interface ManualOverride {
  /** IMA OpenAPI Client ID。设置后将覆盖其他配置源。 */
  clientId?: string;
  /** IMA OpenAPI API Key。设置后将覆盖其他配置源。 */
  apiKey?: string;
  /** IMA Work 知识库 ID。设置后将覆盖其他配置源。 */
  workKbId?: string;
}

export interface ImaSyncConfig {
  /** 总开关。false 时插件完全不注册监听。默认 true。 */
  enabled?: boolean;
  /** 每轮对话结束（turn/end）时上传一条进度记录。默认 true。 */
  triggerOnTurnEnd?: boolean;
  /** 会话销毁（agent/disposed）时上传一条会话总结。默认 true。 */
  triggerOnSessionEnd?: boolean;
  /** IMA OpenAPI Client ID。留空依次回退：环境变量 -> ~/.config/ima/client_id。 */
  clientId?: string;
  /** IMA OpenAPI API Key。留空依次回退：环境变量 -> ~/.config/ima/api_key。 */
  apiKey?: string;
  /** IMA Work 知识库 ID（全局默认）。留空则只创建/追加笔记，不关联知识库。 */
  workKbId?: string;
  /** 项目级别的知识库映射。key 为项目名，value 为知识库 ID。 */
  projectKnowledgeBases?: Record<string, string>;
  /** 本机 ima-upload 脚本路径。留空默认 ~/.local/bin/ima-upload；脚本不存在时走直接 API。 */
  imaUploadBin?: string;
  /** 项目名映射文件（cwd -> 项目名）。留空默认 ~/.config/ima/projects.json。 */
  projectsFile?: string;
  /** 每日笔记缓存目录。留空默认 ~/.cache/ima/daily-notes（与 Claude 脚本共用）。 */
  cacheDir?: string;
  /** cwd 未命中项目映射时的兜底项目名。留空使用目录名。 */
  defaultProject?: string;
  /** 用户输入在进度记录中的最大字符数。默认 300。 */
  maxPromptLength?: number;
  /** 详情（detail）最大字符数。默认 20000。 */
  maxDetailLength?: number;
  /** ima-upload 脚本超时（毫秒）。默认 120000。 */
  timeoutMs?: number;
  /** 手动配置覆盖。设置后将优先使用此配置，忽略环境变量和本地文件。 */
  manualOverride?: ManualOverride;
}

export declare const name: 'ima-sync';
export declare const inject: never[];
export declare const Config: import('@deepseek-ai/schemastery').S;
export declare function apply(ctx: Context, config: ImaSyncConfig): void;