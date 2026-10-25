// S-955·S-956: 파일 카드. 확장자 배지(폴더는 DIR)·이름·크기와 수정일·경로. 파일이 없으면 "Missing"(보드가 보이는 동안 5초마다, 우클릭할 때 다시 확인)
import { useCallback, useEffect, useRef, useState } from "react";
import { useScope } from "../board/BoardScope";
import { fileStat, type FileStat } from "../lib/ipc";
import { baseName } from "./make";
import { useT } from "../i18n";
import { startPoll } from "../perf/poll";

const GONE: FileStat = { exists: false, isDir: false, size: 0, mtime: 0 };
export const CHECK_MS = 5000;

export const fmtSize = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round((n / 1024) * 10) / 10} KB` : `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;
const p2 = (n: number) => String(n).padStart(2, "0");
export const fmtDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const badgeOf = (name: string, isDir: boolean): string => {
  if (isDir) return "DIR";
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i + 1, i + 5).toUpperCase() : "FILE";
};

export default function FileCard({ id }: { id: string }) {
  const t = useT();
  const { store: useBoard, visible } = useScope();
  const node = useBoard((s) => s.nodes[id]);
  const path = (node?.path as string | undefined) ?? "";
  const [st, setSt] = useState<FileStat | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const check = useCallback(() => void fileStat(path).then(setSt, () => setSt(GONE)), [path]);
  useEffect(() => {
    if (!visible) return;
    return startPoll(check, CHECK_MS);
  }, [visible, check]);
  // 우클릭할 때 다시 확인: 보드의 우클릭 처리가 전파를 막아도 받도록 캡처 단계에서 듣는다
  useEffect(() => {
    const el = root.current;
    el?.addEventListener("contextmenu", check, true);
    return () => el?.removeEventListener("contextmenu", check, true);
  }, [check]);
  if (!node) return null;
  const isDir = node.isDir === true || st?.isDir === true;
  const name = (node.name as string | undefined) ?? baseName(path);
  const missing = st !== null && !st.exists;
  return (
    <div ref={root} data-testid="file-card" style={{
      width: "100%", height: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 12, padding: 12, overflow: "hidden",
      background: "var(--surface)", border: `1px ${missing ? "dashed" : "solid"} ${missing ? "var(--bd-2)" : "var(--bd)"}`, borderRadius: 10, font: "12px system-ui", color: "var(--fg-2)",
    }}>
      <div data-testid="file-badge" style={{
        flex: "none", width: 48, height: 56, display: "grid", placeItems: "center", borderRadius: isDir ? "4px 10px 6px 6px" : 6,
        border: "1px solid var(--bd-2)", background: "var(--surface-2)", color: "var(--fg-2)", font: "700 11px system-ui", letterSpacing: 0.3,
      }}>{badgeOf(name, isDir)}</div>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
        <div data-testid="file-name" title={name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", font: "600 13px system-ui", color: "var(--fg)" }}>{name}</div>
        {missing ? (
          <div data-testid="file-missing" style={{ color: "var(--warn-fg, var(--fg-3))", font: "600 11px system-ui" }}>{t("Missing")}</div>
        ) : st ? (
          <div data-testid="file-meta" style={{ color: "var(--mute-2)", font: "11px system-ui" }}>{isDir ? t("Folder") : fmtSize(st.size)} · {fmtDate(st.mtime)}</div>
        ) : null}
        <div data-testid="file-path" title={path} style={{ color: "var(--mute-3)", font: "11px system-ui", wordBreak: "break-all", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{path}</div>
      </div>
    </div>
  );
}
