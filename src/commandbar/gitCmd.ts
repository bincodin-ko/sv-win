// S-1060~S-1062: 명령줄 git. C9 actions 를 부르고 결과를 답 한 줄로 바꾼다. 패널이 닫혀 있어도 되도록 먼저 상태를 읽는다.
import { commitOnly, commitPush, pullOnly, pushOnly } from "../git/actions";
import { t, tp } from "../i18n";
import { DIVERGED, checkedOf, repoOf, useGit } from "../git/useGit";

export const NO_REPO = "There's no git repository open.";
export type GitOp = "commitPush" | "push" | "pull" | "commit";

/** git/actions 가 만든 "Committed 2 files · pushed" 를 화면 언어로 */
function doneText(done: string): string {
  const m = done.match(/^Committed (\d+) files?( · pushed)?$/);
  if (!m) return done;
  const n = Number(m[1]);
  const base = tp("Committed {n} file", "Committed {n} files", n);
  return m[2] ? t("{done} · pushed", { done: base }) : base;
}

const firstLine = (s: string) => s.split("\n")[0]!.trim();

export async function runGitOp(repo: string, op: GitOp, message?: string): Promise<string> {
  if (!repo) return t("There's no git repository open.");
  await useGit.getState().refresh(repo);
  const r0 = repoOf(useGit.getState().by, repo);
  if (!r0.st || (!r0.st.ok && r0.st.notGit)) return t("There's no git repository open.");
  const paths = checkedOf(r0.st, r0.unchecked);

  let out;
  if (op === "pull") out = await pullOnly(repo);
  else if (paths.length) out = await (op === "commit" ? commitOnly : commitPush)(repo, { message, paths });
  else if (op === "push") out = await pushOnly(repo);
  else return t("Nothing to commit"); // commit · commit and push 에 올릴 변경이 없다
  if (!out) return t("Git is busy. Try again in a moment.");

  const r = repoOf(useGit.getState().by, repo);
  if (out.ok) return op === "pull" ? t("Pulled") : op === "push" && !paths.length ? t("Pushed") : r.done ? doneText(r.done) : t("Done");
  const reason = firstLine(out.message);
  return out.diverged ? t(DIVERGED) : op === "pull" ? t("Couldn't pull: {reason}", { reason }) : op === "commit" ? t("Couldn't commit: {reason}", { reason }) : t("Couldn't push: {reason}", { reason });
}
