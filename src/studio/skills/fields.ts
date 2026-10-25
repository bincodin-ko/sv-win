// 5묶음 E7 S-2077: 필드 표(한 파일에 모음). 문서는 규칙만 말해서 표 내용은 추측(명세 그대로).
export const CLAUDE_CODE_FIELDS: readonly string[] = ["name", "description", "when_to_use", "argument-hint", "disable-model-invocation", "user-invocable", "allowed-tools", "model", "effort", "context", "agent", "hooks", "paths", "shell"];
/** claude.ai / API 업로드가 받는 것. 나머지 Claude Code 필드는 "Claude Code-only" */
export const UPLOAD_FIELDS: readonly string[] = ["name", "description", "license", "compatibility", "metadata"];
export type FieldKind = "shared" | "code-only" | "unknown";
/** 위 14개에 없으면 unknown(license 등도 — 명세 S-2077 그대로). 14개 중 업로드가 받는 것은 shared, 아니면 code-only */
export const fieldKind = (key: string): FieldKind => (!CLAUDE_CODE_FIELDS.includes(key) ? "unknown" : UPLOAD_FIELDS.includes(key) ? "shared" : "code-only");
