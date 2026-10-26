// S-3125: 버전·플랫폼 + 업데이트 확인(Check now, 시작 때 확인 체크 상자). 앱이 설치 파일을 실행하지 않는다
import { useState } from "react";
import { useT } from "../../i18n";
import { openUrl } from "../../lib/ipc";
import { checkUpdate, newerThan, type UpdateInfo } from "../../update/check";
import { useSettings } from "../useSettings";
declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__; // vite.config.ts 가 package.json version 을 넣는다
type St = null | "checking" | "none" | "failed" | "same" | UpdateInfo;
const dt = { color: "var(--text-dim)" };
const dd = { margin: 0 };
export default function About() {
  const t = useT();
  const [st, setSt] = useState<St>(null);
  const on = useSettings((x) => x.s.updateCheck !== false);
  const patch = useSettings((x) => x.patch);
  const check = async () => {
    setSt("checking");
    const r = await checkUpdate();
    setSt(typeof r === "string" ? r : newerThan(r.tag, APP_VERSION) ? r : "same");
  };
  const info = typeof st === "object" && st ? st : null;
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}>
      <dt style={dt}>{t("Version")}</dt><dd style={dd}>{APP_VERSION}</dd>
      <dt style={dt}>{t("Platform")}</dt><dd style={dd}>Windows</dd>
      {st !== "none" && (<>
        <dt style={dt}>{t("Updates")}</dt>
        <dd style={dd}>
          <button data-testid="about-check" onClick={() => void check()} disabled={st === "checking"}>{t("Check now")}</button>
          {st && (
            <span data-testid="about-update" style={{ marginLeft: 10 }}>
              {st === "checking" ? t("Checking…") : st === "same" ? t("You're up to date") : st === "failed" ? t("Couldn't check for updates") : t("Version {tag} is available", { tag: info!.tag })}
              {info && <button data-testid="about-get" style={{ marginLeft: 10 }} onClick={() => void openUrl(info.asset?.url ?? info.url).catch((e) => console.debug(e))}>{info.asset ? t("Get installer") : t("Release page")}</button>}
              {info?.asset?.sha256 && <div style={{ font: "11px ui-monospace, Consolas, monospace", color: "var(--text-dim)", userSelect: "text", wordBreak: "break-all", marginTop: 4 }}>{t("SHA-256: {sha256}", { sha256: info.asset.sha256 })}</div>}
            </span>
          )}
        </dd>
      </>)}
      <dd style={{ ...dd, gridColumn: "1 / -1" }}>
        <label><input type="checkbox" data-testid="about-autocheck" checked={on} onChange={(e) => patch({ updateCheck: e.target.checked })} /> {t("Check for updates at startup")}</label>
      </dd>
    </dl>
  );
}
