// S-384~S-388: GitHub 한 줄. 토큰은 gh 의 보관소에 있고 앱은 저장하지도 보이지도 않는다.
import { useEffect, useState } from "react";
import { connectGh, copyInstall, useGh } from "../../git/ghConnect";
import { ghLogout } from "../../lib/ipc";
import { useShell } from "../../shell/useShell";
import { useUi } from "../../ui/useUi";
import { useT } from "../../i18n";

export default function Connections() {
  const t = useT();
  const st = useGh((s) => s.st);
  const wsId = useShell((s) => s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs ?? null);
  const [sure, setSure] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => void useGh.getState().refresh(), []); // 설정 창을 열 때 읽는다

  const connect = () => wsId && connectGh(wsId, () => useUi.getState().closeSettings());
  const disconnect = async () => {
    if (!sure) return setSure(true);
    setSure(false);
    await ghLogout().catch(() => {});
    await useGh.getState().refresh();
  };
  const copy = async () => { if (await copyInstall()) setCopied(true); };

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 480 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <strong>GitHub</strong>
        {!st ? <span>…</span> : !st.installed ? (
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {t("GitHub CLI not found")}
            <button data-testid="gh-copy-install" onClick={copy}>{copied ? t("Copied") : t("Copy install command")}</button>
          </span>
        ) : st.user ? (
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span data-testid="gh-user">{st.user}</span>
            <button data-testid="gh-disconnect" onClick={disconnect} onBlur={() => setSure(false)}>
              {sure ? t("Click again — this signs gh out everywhere") : t("Disconnect")}
            </button>
          </span>
        ) : (
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button data-testid="gh-connect" disabled={!wsId} onClick={connect}>{t("Connect GitHub")}</button>
            {!wsId && <span style={{ color: "var(--mute)" }}>{t("Open a repo first")}</span>}
          </span>
        )}
      </div>
      <button data-testid="gh-refresh" onClick={() => void useGh.getState().refresh()} style={{ justifySelf: "start" }}>{t("Refresh")}</button>
    </div>
  );
}
