// S-338: 열린 모든 워크스페이스의 실행 중 콘솔 수. 0이면 숨김. 누르면 아무 일 없음(Mission Map 은 4묶음)
import { useEffect, useState } from "react";
import { runningCount } from "../console/session";
import { useT } from "../i18n";

export default function LiveChip() {
  const t = useT();
  const [n, setN] = useState(0);
  // ponytail: 0.5초마다 읽는다. 세션 목록이 변경 알림을 내면 구독으로 바꾼다
  useEffect(() => {
    const iv = setInterval(() => setN(runningCount()), 500);
    setN(runningCount());
    return () => clearInterval(iv);
  }, []);
  return n > 0 ? (
    <span data-testid="live-chip" style={{ height: 26, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 10px", borderRadius: 13, background: "var(--panel-2)", border: "1px solid var(--border)", font: "12px system-ui", color: "var(--text)" }}>
      <i style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--ok)" }} />{t("{n} live", { n })}
    </span>
  ) : null;
}
