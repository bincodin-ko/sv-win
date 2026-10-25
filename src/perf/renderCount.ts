// 9묶음 P1 시험용: Tauri 밖(브라우저 시험)에서만 window.__renders[이름]을 센다(리렌더 횟수 e2e). exe 에서는 세지 않는다.
export const bump = (k: string): void => {
  if ("__TAURI_INTERNALS__" in window) return; // 브라우저(시험)에서만
  const r = ((window as any).__renders ??= {}) as Record<string, number>;
  r[k] = (r[k] ?? 0) + 1;
};
