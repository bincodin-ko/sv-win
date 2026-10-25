// S-2723 Shortcuts 창 "Fixed keys" 표 데이터(바꿀 수 없는 키). 키 이름은 번역하지 않고 what 만 번역한다
import { tm } from "../i18n";

export type FixedKey = { keys: string; what: string };
export const FIXED_KEYS: FixedKey[] = [
  { keys: "Ctrl+K", what: tm("Focus the command bar") },
  { keys: "Ctrl+Shift+P", what: tm("Focus the command bar from anywhere") },
  { keys: "F6 / Shift+F6", what: tm("Move between areas") },
  { keys: "Ctrl+F6 / Ctrl+Shift+F6", what: tm("Next or previous console") },
  { keys: "Ctrl+PageUp / Ctrl+PageDown", what: tm("Previous or next workspace tab") },
  { keys: "F2", what: tm("Rename") },
  { keys: "Ctrl+S", what: tm("Save") },
  { keys: "Ctrl+Z / Ctrl+Y", what: tm("Undo / Redo") },
  { keys: "Ctrl+A / Ctrl+C / Ctrl+X / Ctrl+V / Ctrl+D", what: tm("Select all, copy, cut, paste, duplicate") },
  { keys: "Ctrl+G / Ctrl+Shift+G", what: tm("Group / Ungroup") },
  { keys: "Ctrl+Shift+T", what: tm("Tidy up") },
  { keys: "Ctrl+0 / Ctrl++ / Ctrl+-", what: tm("Reset, zoom in, zoom out") },
  { keys: "Shift+1", what: tm("Show everything") },
  { keys: "X", what: tm("Mission map") },
  { keys: "Ctrl+O", what: tm("Open a folder") },
  { keys: "Ctrl+Shift+L", what: tm("Go to the home screen") },
  { keys: "Ctrl+Shift+W", what: tm("Close the repo") },
  { keys: "Ctrl+,", what: tm("Settings") },
  { keys: "Ctrl+Q", what: tm("Quit") },
  { keys: "Ctrl+Space", what: tm("Dictate into the focused console or field") },
];
