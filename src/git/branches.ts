// C14: 브랜치 카드 순수 함수 (S-1051·S-1053)
import type { GitBranch } from "../lib/ipc";
import { t } from "../i18n";

export const MAX_BRANCHES = 200;

/** 이름순 200개. 현재 브랜치가 잘려 나가면 마지막 자리에 넣어 현재 표시가 항상 보이게 한다 */
export function shownBranches(list: GitBranch[]): GitBranch[] {
  const all = [...list].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const out = all.slice(0, MAX_BRANCHES);
  const cur = all.find((b) => b.current);
  if (cur && !out.includes(cur)) out[out.length - 1] = cur;
  return out;
}

// git check-ref-format: 공백·제어문자·~^:?*[\ 금지, .. @{ // 금지, 앞 - / 금지, 끝 / . .lock 금지, "@" 단독 금지
const BAD = /[\s~^:?*[\\\x00-\x1f\x7f]|\.\.|@\{|\/\/|^[-/]|[/.]$|\.lock$|^@$/;
/** 이름이 비었으면 안내 문구, git 이 거절할 이름이면 git 문구, 괜찮으면 null. 앞뒤 공백은 무시 */
export function branchNameError(raw: string): string | null {
  const n = raw.trim();
  if (!n) return t("Enter a branch name");
  return BAD.test(n) ? t("'{n}' is not a valid branch name", { n }) : null;
}
