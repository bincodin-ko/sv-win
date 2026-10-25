// S-372·S-680·S-686: "Report status from the agent itself". 켜기 전에 바뀌는 파일을 보이고, 켠 뒤 재시작·Codex 신뢰 안내
import { useState } from "react";
import { startLiveStatus, stopLiveStatus } from "../../console/session";
import { liveDisable, liveEnable, livePaths, type LivePaths } from "../../lib/ipc";
import { useSettings } from "../useSettings";
import { useT } from "../../i18n";

const hint: React.CSSProperties = { color: "var(--mute)", fontSize: 12 };
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center" };

export default function LiveStatusRow() {
  const t = useT();
  const on = useSettings((st) => st.s.liveStatus === true);
  const patch = useSettings.getState().patch;
  const [ask, setAsk] = useState<LivePaths | null>(null);
  const [error, setError] = useState("");

  const toggle = async (next: boolean) => {
    setError("");
    if (next) {
      setAsk({ claude: "", codex: "", script: "" }); // 먼저 안내 — 아직 아무것도 바꾸지 않는다(경로는 곧 채워진다)
      return setAsk(await livePaths());
    }
    try {
      await liveDisable();
      stopLiveStatus();
      patch({ liveStatus: false });
    } catch (e) {
      setError(String(e));
    }
  };
  const confirm = async () => {
    try {
      await liveEnable();
      await startLiveStatus();
      patch({ liveStatus: true });
      setAsk(null);
    } catch (e) {
      setError(String(e));
      setAsk(null);
    }
  };

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label style={row}>
        <input type="checkbox" checked={on || ask !== null} onChange={(e) => void toggle(e.target.checked)} />
        {t("Report status from the agent itself")}
      </label>
      <span style={hint}>{t("Claude Code and Codex tell Symvibe when they are working, waiting for you, or ready. Off: the status follows console output.")}</span>
      {ask && (
        <div data-testid="live-confirm" style={{ display: "grid", gap: 6, padding: 10, border: "1px solid var(--border)", borderRadius: 8 }}>
          <div>{t("Turning this on changes two files. A backup is made first, once, next to each file (.hypervibe-backup). Your other hooks and status line are kept.")}</div>
          <code style={{ fontSize: 12 }}>{ask.claude}</code>
          <code style={{ fontSize: 12 }}>{ask.codex}</code>
          <div style={hint}>{t("It also writes a small script at {path}. Events go to this app over a local port and never leave this PC.", { path: ask.script })}</div>
          <div style={row}>
            <button onClick={() => void confirm()}>{t("Turn on")}</button>
            <button onClick={() => setAsk(null)}>{t("Cancel")}</button>
          </div>
        </div>
      )}
      {on && (
        <div data-testid="live-notice" style={hint}>
          {t('Applies to consoles you start from now on. Restart running consoles to apply it. The first time Codex sees these hooks it asks you to trust them: choose "Trust all and continue".')}
        </div>
      )}
      {error && <div role="alert" style={{ color: "var(--err-text)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
