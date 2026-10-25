// S-340: Tools 메뉴. 항목은 배열이라 뒤 묶음이 줄을 더한다(Chat 은 만들지 않는다).
import { openSettings, useUi } from "../ui/useUi";
import { requestOpenStudio } from "../studio/useStudio";
import { getStudio, type StudioId } from "../studio/registry";
import { Menu, MenuItem } from "./Menu";
import { tm, useT } from "../i18n";

// S-1804: Code·Markdown·Skills 는 그 스튜디오가 등록돼 있고 tools 가 있을 때만 나온다(눌러도 안 되는 항목 금지)
const studioItem = (id: StudioId, label: string): ToolItem => ({ id, label, run: () => void requestOpenStudio(id), when: () => !!getStudio(id)?.tools });
type ToolItem = { id: string; label: string; run: () => void; when?: () => boolean };
export const toolsItems: ToolItem[] = [
  { id: "presets", label: tm("Presets"), run: () => useUi.setState({ presetsOpen: true }) }, // 창은 PresetsHost (B14)
  { id: "github", label: "GitHub", run: () => useUi.getState().openGit() }, // 패널은 GitHost (C9)
  studioItem("code", "Code"),
  studioItem("markdown", "Markdown"),
  { id: "mission", label: tm("Mission Map"), run: () => useUi.getState().openMission() }, // 패널은 MissionHost (D7)
  { id: "memory", label: tm("Memory"), run: () => useUi.getState().openMemory() }, // MemoryHost (D8)
  studioItem("skills", "Skills"),
  { id: "loops", label: tm("Loops"), run: () => useUi.getState().openLoops() }, // LoopsHost (D9)
  { id: "settings", label: tm("Settings"), run: () => openSettings() },
];

export default function ToolsMenu() {
  const t = useT();
  return (
    <Menu testId="tools-btn" label={t("Tools") + " ▾"}>
      {(close) => toolsItems.filter((i) => i.when?.() ?? true).map((i) => <MenuItem key={i.id} onClick={() => { close(); i.run(); }}>{t(i.label)}</MenuItem>)}
    </Menu>
  );
}
