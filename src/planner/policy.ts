// S-2950·S-2952: 실행 정책과 확인 질문 속 한 줄
import type { Intent, Target } from "../commandbar/intent";
import { t } from "../i18n";
import { INTENT_TABLE } from "./table";

export function policyOf(i: Intent): "run" | "confirm" {
  return Object.prototype.hasOwnProperty.call(INTENT_TABLE, i.t) ? INTENT_TABLE[i.t]!.risk : "run";
}

const clip = (s: string) => (s.length > 120 ? s.slice(0, 120) + "…" : s);

export function summarize(i: Intent, names: (t: Target) => string): string {
  switch (i.t) {
    case "tell": return t('Tell {names}: "{text}"', { names: i.targets.map(names).join(", "), text: clip(i.text) });
    case "broadcast": return t('Send to every console: "{text}"', { text: clip(i.text) });
    case "git":
      if (i.op === "commitPush") return t("Git: commit and push");
      if (i.op === "push") return t("Git: push");
      if (i.op === "pull") return t("Git: pull");
      return i.message ? t('Git: commit with message "{message}"', { message: clip(i.message) }) : t("Git: commit");
    default: return i.t;
  }
}
