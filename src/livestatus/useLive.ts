// B16: 콘솔별 hook 상태 보조 정보(호버 문구·마지막 답)와 NEEDS YOU 목록, 수신 구독. 세션(console/session.ts)이 채우고 화면이 읽는다.
import { create } from "zustand";
import { liveUrl, onAgentStatus, type AgentStatusEvent } from "../lib/ipc";

/** S-692: 스레드 보고에 쓰는 마지막 답은 최대 4,000자 */
export const REPLY_MAX = 4000;

interface LiveStore {
  /** 세션 키 → 상태 pill 호버 문구(S-687) */
  detail: Record<string, string>;
  /** 세션 키 → 마지막 답(S-692, B9 스레드 보고가 읽는다) */
  reply: Record<string, string>;
  /** NEEDS YOU·ERROR 인 세션 키, 그렇게 된 순서(S-689) */
  needs: string[];
}
export const useLive = create<LiveStore>(() => ({ detail: {}, reply: {}, needs: [] }));

export function setDetail(key: string, text: string | null): void {
  useLive.setState((s) => {
    const { [key]: _, ...rest } = s.detail;
    return { detail: text ? { ...rest, [key]: text } : rest };
  });
}
export function setReply(key: string, text: string): void {
  useLive.setState((s) => ({ reply: { ...s.reply, [key]: text.slice(0, REPLY_MAX) } }));
}
/** 상태가 바뀔 때마다 부른다: NEEDS YOU·ERROR 면 목록 끝에(이미 있으면 제자리), 아니면 뺀다 */
export function trackNeeds(key: string, status: string): void {
  const need = status === "NEEDS YOU" || status === "ERROR";
  useLive.setState((s) => {
    const has = s.needs.includes(key);
    if (need === has) return s;
    return { needs: need ? [...s.needs, key] : s.needs.filter((k) => k !== key) };
  });
}
/** 세션이 없어질 때 */
export function forget(key: string): void {
  trackNeeds(key, "DONE");
  setDetail(key, null);
  useLive.setState((s) => {
    const { [key]: _, ...rest } = s.reply;
    return { reply: rest };
  });
}

// 콘솔 id: env SYMVIBE_CONSOLE 과 이벤트의 console. 워크스페이스 id | 노드 id 를 각각 URL 인코딩해 `|` 로 잇는다
// (헤더·cmd 변수 안에서 따옴표·공백이 깨지지 않게). `|` 가 없으면 노드 id 만(기본 저장소 시험용)
export const consoleId = (wsId: string, nodeId: string): string => `${encodeURIComponent(wsId)}|${encodeURIComponent(nodeId)}`;
export function parseConsoleId(c: string): { wsId: string; nodeId: string } {
  const i = c.indexOf("|");
  return i < 0 ? { wsId: "", nodeId: c } : { wsId: decodeURIComponent(c.slice(0, i)), nodeId: decodeURIComponent(c.slice(i + 1)) };
}

let started: Promise<string | null> | null = null;
let unlisten: (() => void) | null = null;
/** 수신기 주소를 받고(없으면 열고) 이벤트 구독을 시작한다. 한 번만. 실패하면 null(출력 기준으로 남는다) */
export function startLive(dispatch: (e: AgentStatusEvent) => void): Promise<string | null> {
  started ??= liveUrl()
    .then((url) => {
      unlisten = onAgentStatus(dispatch);
      return url;
    })
    .catch(() => {
      started = null;
      return null;
    });
  return started;
}
export function stopLive(): void {
  unlisten?.();
  unlisten = null;
  started = null;
}
