// S-3120~S-3124: GitHub Releases 업데이트 확인 (알림과 설치 파일 받기 단추만, 앱이 설치 파일을 실행하지 않는다)
// 옛 이름 bincodin-ko/symvibe-win 은 GitHub 가 sv-win 으로 넘겨준다 — 새 이름을 쓴다
import { settingsGet } from "../agents/api";
import { t } from "../i18n";
import { isTauri, openUrl } from "../lib/ipc";
import { showNotice } from "../lib/notice";
import { APP_VERSION } from "../settings/panes/About";
import { useSettings } from "../settings/useSettings";

export const UPDATE_REPO = "bincodin-ko/sv-win";
export type UpdateInfo = { tag: string; url: string; asset?: { name: string; url: string; sha256?: string } };

const parse = (tag: string): number[] | null => {
  const m = /^[vV]?(\d+(?:\.\d+){0,2})$/.exec(tag.trim()); // -beta 같은 꼬리는 읽지 않는다(새 버전으로 안 봄)
  return m?.[1] ? m[1].split(".").map(Number) : null;
};
/** S-3120: major.minor.patch 숫자 비교(모자란 자리는 0). 꼬리가 있거나 못 읽는 태그는 false */
export function newerThan(tag: string, current: string): boolean {
  const a = parse(tag), b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}

/** S-3121: 최신 릴리스 한 번 조회(8초 제한, 쿠키·인증 없음). 404 = "none", 그 밖 실패 = "failed" */
export async function checkUpdate(): Promise<UpdateInfo | "none" | "failed"> {
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"failed">((res) => { timer = setTimeout(() => { ctl.abort(); res("failed"); }, 8000); });
  const run = async (): Promise<UpdateInfo | "none" | "failed"> => {
    try {
      const r = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, credentials: "omit", signal: ctl.signal });
      if (r.status === 404) return "none";
      if (!r.ok) return "failed";
      const j = (await r.json()) as { tag_name?: string; html_url?: string; assets?: { name?: string; browser_download_url?: string; digest?: string }[] };
      if (!j.tag_name || !j.html_url) return "failed";
      const a = j.assets?.find((x) => x.name?.endsWith("-setup.exe") && x.browser_download_url);
      const sha = a?.digest?.startsWith("sha256:") ? a.digest.slice(7) : undefined;
      return { tag: j.tag_name, url: j.html_url, ...(a ? { asset: { name: a.name!, url: a.browser_download_url!, ...(sha ? { sha256: sha } : {}) } } : {}) };
    } catch {
      return "failed";
    }
  };
  try { return await Promise.race([run(), timeout]); } finally { clearTimeout(timer); }
}

type W = { __updateTest?: { delayMs?: number } };
/** S-3122: 시작 10초 뒤 한 번. 비Tauri 에서는 window.__updateTest 가 있을 때만(기존 e2e 에 알림이 끼지 않게) */
export function startupUpdateCheck(): void {
  const w = window as unknown as W;
  if (!isTauri() && !w.__updateTest) return;
  setTimeout(() => {
    void (async () => {
      const s = await settingsGet(); // 설정 읽기: 끄면 확인 자체를 안 한다
      if (s.updateCheck === false) return;
      const r = await checkUpdate();
      if (typeof r === "string") return console.debug("update check:", r); // 조용히(S-3124)
      if (!newerThan(r.tag, APP_VERSION) || r.tag === s.updateSkip) return;
      showNotice(t("Symvibe {tag} is available.", { tag: r.tag }), 15000, [
        { label: r.asset ? t("Get installer") : t("Release page"), run: () => void openUrl(r.asset?.url ?? r.url).catch((e) => console.debug(e)) },
        { label: t("Not now"), run: () => useSettings.getState().patch({ updateSkip: r.tag }) },
      ]);
    })().catch((e) => console.debug("update check:", e));
  }, isTauri() ? 10000 : w.__updateTest?.delayMs ?? 0);
}
