// 5묶음 E1 S-1801·S-1802: 스튜디오 틀 — 가운데 모달(role="dialog"라서 보드 키가 쉰다), 왼쪽 목록 + 오른쪽 내용, 머리줄 제목·닫기 ×.
// 바깥을 눌러도 안 닫힌다(편집 손실 방지). Esc: 안쪽 메뉴·검색줄이 먼저 닫고(그쪽이 preventDefault), 그다음 스튜디오가 닫힌다.
import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "../i18n";
import { useModal } from "../ui/useModal";

export interface StudioFrameProps {
  title: string;
  /** 왼쪽 목록 칸(260~300px) */
  left?: ReactNode;
  children: ReactNode;
  onClose: () => void;
}

export default function StudioFrame({ title, left, children, onClose }: StudioFrameProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, { onClose, initialFocus: () => ref.current }); // Tab 가두기·Esc·포커스 복원(S-2740)
  // 열 때 포커스가 사라지는 메뉴 항목이었으면(Tools 메뉴) 닫을 때 Tools 단추로
  useEffect(() => () => { const a = document.activeElement; if (!a || a === document.body) document.querySelector<HTMLElement>('[data-testid="tools-btn"]')?.focus(); }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "grid", placeItems: "center", background: "var(--studio-scrim)" }} onPointerDown={(e) => e.stopPropagation()}>
      <div ref={ref} data-testid="studio-frame" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        style={{ width: "min(1280px, 92vw)", height: "86vh", display: "flex", flexDirection: "column", background: "var(--studio-bg)", color: "var(--text)", border: "1px solid var(--studio-line)", borderRadius: 12, overflow: "hidden", outline: "none", font: "13px system-ui", boxShadow: "0 16px 48px var(--scrim-50)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid var(--studio-line)" }}>
          <div data-testid="studio-title" style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <button data-testid="studio-close" aria-label={t("Close")} title={t("Close")} onClick={onClose}
            style={{ marginLeft: "auto", width: 28, height: 28, border: 0, borderRadius: 6, background: "transparent", color: "var(--text-dim)", font: "18px/1 system-ui", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          {left !== undefined && (
            <div data-testid="studio-left" style={{ width: 280, flex: "none", overflow: "auto", background: "var(--studio-side)", borderRight: "1px solid var(--studio-line)" }}>{left}</div>
          )}
          <div data-testid="studio-main" style={{ flex: 1, minWidth: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
