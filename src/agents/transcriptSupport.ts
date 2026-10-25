// Q3 S-3140·S-3149~S-3151: 어느 CLI의 대화 기록을 읽을 수 있는지(지원 표)와 고르는 곳의 공통 줄 만들기
import { t } from "../i18n";

export type TranscriptSupport = { ok: true } | { ok: false; why: string };
export interface PickerRow { id: string; name: string; enabled: boolean; why?: string }

/** 읽을 수 있는 CLI(순서 = 고르는 곳 순서)와 화면 이름 */
const LABEL: Record<string, string> = { claude: "Claude Code", codex: "Codex", gemini: "Gemini CLI", opencode: "OpenCode" };
const READABLE = Object.keys(LABEL);
export const transcriptLabel = (id: string): string | undefined => LABEL[id];

export function canReadTranscript(id: string, name: string = id): TranscriptSupport {
  return READABLE.includes(id) ? { ok: true } : { ok: false, why: t("Symvibe can't read {name}'s chat history yet", { name }) };
}

/**
 * 고르는 곳의 줄: alwaysShow 는 미설치여도 보임(enabled false), 읽는 CLI 는 설치됐을 때만 canonical 순서로,
 * 설치된 못 읽는 CLI(Shell 제외)는 맨 뒤에 회색 + 이유
 */
export function pickerRows(installed: { id: string; name: string; installed: boolean }[], alwaysShow: string[]): PickerRow[] {
  const have = (id: string) => installed.find((a) => a.id === id)?.installed === true;
  const rows: PickerRow[] = READABLE.filter((id) => alwaysShow.includes(id) || have(id)).map((id) => ({ id, name: LABEL[id]!, enabled: have(id) }));
  for (const a of installed) {
    if (!a.installed || a.id === "shell" || READABLE.includes(a.id)) continue;
    const r = canReadTranscript(a.id, a.name);
    rows.push({ id: a.id, name: a.name, enabled: false, ...(r.ok ? {} : { why: r.why }) });
  }
  return rows;
}
