// 창 등록 목록(S-351). 뒤 일감은 파일 하나 + 여기 한 줄을 더한다. 순서 = 목록 순서.
import type { ComponentType } from "react";
import { tm } from "../i18n";
import Account from "./panes/Account";
import General from "./panes/General";
import Appearance from "./panes/Appearance";
import Agents from "./panes/Agents";
import Shortcuts from "./panes/Shortcuts";
import Connections from "./panes/Connections";
import Voice from "./panes/Voice";
import About from "./panes/About";

export interface Pane { id: string; title: string; Component: ComponentType }
export const PANES: Pane[] = [
  { id: "account", title: tm("Account"), Component: Account },
  { id: "general", title: tm("General"), Component: General },
  { id: "appearance", title: tm("Appearance"), Component: Appearance },
  { id: "shortcuts", title: tm("Shortcuts"), Component: Shortcuts },
  { id: "agents", title: tm("Agents"), Component: Agents },
  { id: "connections", title: tm("Connections"), Component: Connections },
  { id: "voice", title: tm("Voice"), Component: Voice },
  { id: "about", title: tm("About"), Component: About },
];
