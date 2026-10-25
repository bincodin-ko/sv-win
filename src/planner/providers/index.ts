// 13묶음 R1 S-3300·S-3301: 공급자 표(순수 — React·ipc 없음)
export type CliId = "claude" | "codex" | "gemini" | "opencode";
export type ApiId = "api:openai" | "api:anthropic" | "api:gemini" | "api:compat";
export type ProviderId = CliId | ApiId;
export type Provider = { id: ProviderId; kind: "cli" | "api"; label: string; model: string; models: string[]; needsKey: boolean };

const P = (id: ProviderId, label: string, model: string, models: string[], needsKey = false): Provider => ({ id, kind: id.startsWith("api:") ? "api" : "cli", label, model, models, needsKey });
// 기본 모델 이름은 2026-10 기준 짐작 [추측] — 틀리면 설정의 '연결 시험' 목록에서 고른다
export const PROVIDERS: readonly Provider[] = [
  P("claude", "Claude Code", "haiku", ["haiku", "sonnet", "opus"]),
  P("codex", "Codex (GPT)", "", []),
  P("gemini", "Gemini CLI", "", ["gemini-2.5-flash", "gemini-2.5-pro"]),
  P("opencode", "OpenCode", "", []),
  P("api:openai", "OpenAI API", "gpt-5-mini", ["gpt-5-mini", "gpt-5"], true),
  P("api:anthropic", "Anthropic API", "claude-haiku-4-5", ["claude-haiku-4-5", "claude-sonnet-4-5"], true),
  P("api:gemini", "Google Gemini API", "gemini-2.5-flash", ["gemini-2.5-flash", "gemini-2.5-pro"], true),
  P("api:compat", "OpenAI-compatible (Ollama…)", "", []),
];

export const isApi = (id: unknown): id is ApiId => typeof id === "string" && PROVIDERS.some((p) => p.kind === "api" && p.id === id);

export const DEFAULT_BASE_URL = "http://localhost:11434/v1";

type S = { plannerModel?: unknown; plannerBaseUrl?: unknown };
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
export function modelFor(settings: S, id: ProviderId): string {
  const m = settings.plannerModel;
  const v = m && typeof m === "object" && !Array.isArray(m) ? str((m as Record<string, unknown>)[id]) : "";
  return v || (PROVIDERS.find((p) => p.id === id)?.model ?? "");
}
export function baseUrlFor(settings: S): string {
  return str(settings.plannerBaseUrl) || DEFAULT_BASE_URL;
}
