import { createRoot } from "react-dom/client";
import "@xterm/xterm/css/xterm.css";
import "./theme/tokens.css";
import App from "./App";
import "./board/kinds";
import OutputHost from "./output/OutputHost";
import SettingsHost from "./settings/SettingsHost";
import { useSettings } from "./settings/useSettings";
import { ConfirmDialogHost } from "./ui/ConfirmDialog";
import { applyTheme, type Theme } from "./theme/theme";
import { applyLowSpecAttr } from "./perf/lowSpecAttr";
import { startLoops } from "./loops/start";
import { initLang } from "./i18n";
import Nudge from "./livestatus/Nudge";

// 테마는 설정이 바뀔 때마다 적용(S-360). 불러오기 전에는 기본 og
applyTheme("og");
let theme: unknown = "og";
useSettings.subscribe((st) => { if (st.s.theme !== theme) applyTheme((theme = st.s.theme) as Theme); });
let low = false;
useSettings.subscribe((st) => { const on = st.s.lowSpec === true; if (on !== low) applyLowSpecAttr((low = on)); }); // 9묶음 P4: 불러오기·스위치 모두 여기서
startLoops(); // D5 S-1418

// S-2404: 설정을 읽은 뒤에 첫 화면을 그린다(영어가 잠깐 보이지 않게). 읽기에 실패해도 그린다
void useSettings.getState().load().catch(() => {}).then(() => {
  initLang(useSettings.getState().s);
  createRoot(document.getElementById("root")!).render(
    <>
      <App />
      <SettingsHost />
      <OutputHost />
      <ConfirmDialogHost />
      <Nudge />
    </>,
  );
});
