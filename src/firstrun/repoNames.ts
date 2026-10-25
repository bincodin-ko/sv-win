// S-394·S-401: 클론·새 repo 순수 로직 — URL에서 저장소 이름, 기본 위치, 이름 검사.
import { t } from "../i18n";

/** https/ssh/git 주소와 git@host:path 주소에서 저장소 이름(끝 `.git` 뺌). 못 뽑으면 null */
export function repoNameFromUrl(url: string): string | null {
  const u = url.trim();
  // 주소 모양: scheme://host/path  또는  user@host:path. path 만 본다
  const m = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.*)$/i.exec(u) ?? /^[\w.-]+@[\w.-]+:(.*)$/.exec(u);
  const name = (m?.[1] ?? "").replace(/\/+$/, "").split("/").pop()!.replace(/\.git$/i, "");
  return name || null;
}

/** base 아래 name. 끝 구분자는 하나만, 구분자는 base 가 쓰던 것(백슬래시가 있으면 백슬래시) */
export function joinDest(base: string, name: string): string {
  const sep = base.includes("\\") ? "\\" : "/";
  return base.replace(/[\\/]+$/, "") + sep + name;
}

/** 기본 위치: home 아래 symvibe, hypervibe 폴더가 이미 있으면 그것 */
export const defaultBase = (home: string, hasHypervibe: boolean): string => joinDest(home, hasHypervibe ? "hypervibe" : "symvibe");

/** 폴더 이름으로 못 쓰면 이유(영어 한 줄), 괜찮으면 null. taken = 같은 이름 폴더가 이미 있음 */
export function nameError(name: string, taken: boolean): string | null {
  const n = name.trim();
  if (!n) return t("Enter a name");
  if (/[\\/:*?"<>|]/.test(n) || /^\.+$/.test(n)) return t("That name can't be used for a folder");
  return taken ? t("A folder named {n} already exists", { n }) : null;
}
