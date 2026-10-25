// S-330: 보드 위에 겹치는 상단 바(보드 크기는 그대로). 왼쪽 [Back to home][repo chip][탭들 +][Close], 오른쪽 [live][needs you][Tools][톱니][아바타]
// 바 전체는 클릭을 통과시키고 묶음(pill)만 클릭을 받아 보드의 이동·선택을 가리지 않는다.
import { useEffect, type CSSProperties } from "react";
import { consoleHasFocus, installAppKeys } from "./appKeys";
import LiveChip from "./LiveChip";
import NeedsYouChip from "./NeedsYouChip";
import { chipStyle } from "./Menu";
import RepoChip from "./RepoChip";
import Tabs from "./Tabs";
import ToolsMenu from "./ToolsMenu";
import UsagePill from "../usage/UsagePill";
import { useShell } from "./useShell";
import { closeRepoFlow, refreshRepos, runAppKey } from "./workspaces";
import { AVATAR_COLORS, initials } from "../settings/panes/Account";
import { useSettings } from "../settings/useSettings";
import { openSettings } from "../ui/useUi";
import { useT } from "../i18n";

export const BAR_H = 44; // 아래에 놓이는 배너(읽기 전용·Resume all)가 이 값만큼 내려온다
const pill: CSSProperties = { flex: "none", pointerEvents: "auto", display: "flex", alignItems: "center", gap: 8, padding: 4, borderRadius: 10, background: "var(--panel)", border: "1px solid var(--border)" };

export default function TopBar() {
  const t = useT();
  const openRepos = useShell((s) => s.openRepos);
  const active = useShell((s) => s.activeRepo);
  const name = useSettings((s) => String(s.s.profileName ?? ""));
  const color = Number(useSettings((s) => s.s.avatarColor) ?? 0);
  const home = useShell((s) => s.view === "home"); // 홈 화면은 자기 상단(해/달·톱니)이 있어 바를 안 겹친다(S-313·S-325). 키 설치는 계속
  useEffect(() => void refreshRepos(), [openRepos]);
  useEffect(() => installAppKeys((a) => void runAppKey(a), () => ({ view: useShell.getState().view, consoleFocus: consoleHasFocus() })), []);
  if (home) return null;
  return (
    <div data-testid="topbar" style={{ position: "fixed", top: 0, left: 0, right: 0, height: BAR_H, zIndex: 9500, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 8px", pointerEvents: "none" }}>
      <div style={{ ...pill, flex: "0 1 auto", minWidth: 0 }}>
        <button data-testid="back-home" onClick={() => void runAppKey("home")} style={chipStyle}>{t("← Back to home")}</button>
        <RepoChip />
        <div style={{ minWidth: 0, overflowX: "auto" }}><Tabs /></div>
        <button data-testid="close-repo" disabled={!active} onClick={() => active && void closeRepoFlow(active, "button")} style={chipStyle}>{t("Close repo")}</button>
      </div>
      <div style={pill}>
        <LiveChip />
        <span data-testid="needs-you-slot"><NeedsYouChip /></span> {/* S-339: 조건(S-689)은 칩이 안다 */}
        <UsagePill />
        <ToolsMenu />
        <button data-testid="gear" aria-label={t("Settings")} onClick={() => openSettings()} style={chipStyle}>⚙</button>
        <button data-testid="topbar-avatar" aria-label={t("Profile")} onClick={() => openSettings("account")} style={{ width: 26, height: 26, borderRadius: "50%", border: 0, color: "var(--accent-text)", font: "600 11px system-ui", cursor: "pointer", background: AVATAR_COLORS[color] ?? AVATAR_COLORS[0] }}>{initials(name) || "U"}</button>
      </div>
    </div>
  );
}
