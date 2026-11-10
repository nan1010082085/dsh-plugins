/**
 * dsh-plugin-aigc-skill — AIGC 漫剧创作技能套件（skills/shared/tools 随包分发）。
 */
import type { Context } from '@deepseek-ai/cordis';

export interface AigcSkillConfig {
  /** 总开关。false 时插件完全不注册路由。默认 true。 */
  enabled?: boolean;
  /** 一部剧锁定的默认风格 skill（style-*）。留空表示未锁定。 */
  defaultStyle?: string;
}

export declare const name: 'aigc-skill';
export declare const inject: ['webServer'];
export declare const Config: import('@deepseek-ai/schemastery').S;
export declare function apply(ctx: Context, config: AigcSkillConfig): (() => void) | void;
