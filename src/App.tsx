import AppShell from "./shell/AppShell"; // B2: 열린 워크스페이스 보드 전부 + window.__shell 시험 후크
import TerminalView from "./terminal/TerminalView";

// A2: 기본 화면은 보드(AppShell). `?term`=단일 터미널(A4 전까지 smoke용), `?load16`=4×4 부하 시험, `?demo`=빈 상자 노드 2개
export default function App() {
  const q = new URLSearchParams(location.search);
  if (q.has("load16")) {
    return (
      <div style={{ display: "grid", gridTemplate: "repeat(4, 1fr) / repeat(4, 1fr)", gap: 2, height: "100%" }}>
        {Array.from({ length: 16 }, (_, i) => (
          <TerminalView key={i} />
        ))}
      </div>
    );
  }
  if (q.has("term")) return <TerminalView />;
  return <AppShell q={q} />;
}

