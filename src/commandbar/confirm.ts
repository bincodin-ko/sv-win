// S-601: 60초 확인 대기. 다음 입력이 yes/confirm/do it/go ahead 이거나 스레드의 Confirm 을 누르면 실행, 그 밖은 취소.
import { create } from "zustand";
import { t } from "../i18n";
import { mk, useThread } from "./thread";

export const CONFIRM_MS = 60_000;
export type Pending = { repo: string; msgId: string; run: () => void | Promise<void> };
export const useConfirm = create<{ pending: Pending | null }>(() => ({ pending: null }));

const norm = (t: string) => t.trim().toLowerCase().replace(/[.!?\s]+$/, "");
export const isYes = (t: string): boolean => /^(yes|confirm|do it|go ahead|네|예|응|그래|확인|좋아|진행|해줘|해 줘|ㅇㅇ)$/.test(norm(t));
export const isNo = (t: string): boolean => /^(no|n|nope|nah|cancel|cancel that|never ?mind|scratch that|아니|아니요|아니오|아뇨|싫어|취소|취소해|그만|하지 마)$/.test(norm(t));

let timer: ReturnType<typeof setTimeout> | undefined;
const clear = (): Pending | null => {
  clearTimeout(timer);
  const p = useConfirm.getState().pending;
  useConfirm.setState({ pending: null });
  return p;
};
const say = (repo: string, text: string) => useThread.getState().add(repo, mk("bot", text));

/** 스레드에 질문을 남기고 60초 기다린다. 앞의 질문은 대신 밀려난다 */
export function askConfirm(repo: string, question: string, run: () => void | Promise<void>): void {
  clear();
  const m = mk("bot", t("{question} Say yes or click Confirm", { question }));
  useThread.getState().add(repo, m);
  useConfirm.setState({ pending: { repo, msgId: m.id, run } });
  timer = setTimeout(() => {
    if (clear()) say(repo, t("Cancelled: no answer in 60 seconds."));
  }, CONFIRM_MS);
}

/** 다음 입력을 본다: ran = 실행함, cancelled = 취소함(입력은 그대로 이어서 처리), none = 대기 중이 아님 */
export function answerConfirm(repo: string, text: string): "ran" | "cancelled" | "none" {
  const p = useConfirm.getState().pending;
  if (!p || p.repo !== repo) return "none";
  clear();
  if (!isYes(text)) return "cancelled";
  void Promise.resolve(p.run()).catch((e) => say(repo, t("Something went wrong: {message}", { message: e instanceof Error ? e.message : String(e) })));
  return "ran";
}
export function clickConfirm(): void {
  const p = clear();
  if (p) void Promise.resolve(p.run()).catch((e) => say(p.repo, t("Something went wrong: {message}", { message: e instanceof Error ? e.message : String(e) })));
}
/** 대기 중인 확인만 취소한다(cancel that). 있었으면 true */
export function dropConfirm(): boolean {
  return clear() !== null;
}
