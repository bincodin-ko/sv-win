// 열림 상태를 보고 설정 틀을 그린다 + Ctrl+, (S-342: 캡처 단계라 콘솔이 키보드를 가져도 앱이 먼저 받는다)
import { useEffect } from "react";
import SettingsView from "./SettingsView";
import { openSettings, useUi } from "../ui/useUi";

export default function SettingsHost() {
  const open = useUi((s) => s.settings.open);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === ",") {
        e.preventDefault();
        e.stopPropagation();
        openSettings();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return open ? <SettingsView /> : null;
}
