// D15 S-1734·S-1735: every … 명령 -> 앱 확인창 -> 켜진 schedule loop
import { t } from "../i18n";
import { emptyDraft, toLoop } from "../loops/form";
import { useLoops } from "../loops/store";
import { confirmDialog } from "../ui/ConfirmDialog";
import type { Intent } from "./intent";

export const RANGE_TEXT = "Loops run every 1 minute to 24 hours.";
export const EMPTY_TEXT = "Say what to run, like: every 10 minutes run the tests";
const label = (m: number): string => (m % 60 === 0 ? (m === 60 ? t("hour") : t("{n} hours", { n: m / 60 })) : t("{n} min", { n: m }));

/** 답 글을 돌려준다 */
export async function loopCmd(i: Extract<Intent, { t: "loop" }>, ctx: { repo: string; wsId: string }): Promise<string> {
  if (i.bad === "range") return t("Loops run every 1 minute to 24 hours.");
  if (i.bad === "empty" || !i.text || !i.minutes) return t("Say what to run, like: every 10 minutes run the tests");
  const every = label(i.minutes);
  const ok = await confirmDialog({ title: t("Create a recurring instruction?"), message: `${t("Every {every}: {text}", { every, text: i.text })}\n${t("Sent to all consoles on the board.")}`, confirmLabel: t("Create") });
  if (!ok) return t("Okay, no loop.");
  const st = useLoops.getState();
  const n = st.loops.filter((l) => l.repo === ctx.repo).length + 1;
  const id = st.add(toLoop({ ...emptyDraft(), name: i.text.slice(0, 24), instruction: i.text, everyMin: i.minutes }, { ...ctx, n }));
  useLoops.getState().setEnabled(id, true);
  return t("Loop started: every {every}.", { every });
}
