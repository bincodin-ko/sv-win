// S-230·S-231 종료 순서(순수): 실행 중이면 확인 → 모든 보드 저장 → 앱 종료(Rust 가 PTY 를 끝낸다)
export type QuitDeps = {
  running: () => number;
  confirm: (n: number) => Promise<boolean>;
  flush: () => Promise<void>;
  appQuit: () => Promise<void>;
};

export async function quit(d: QuitDeps): Promise<boolean> {
  const n = d.running();
  if (n > 0 && !(await d.confirm(n))) return false;
  try {
    await d.flush();
  } catch (e) {
    console.error("종료 전 저장 실패", e); // 사용자가 이미 확정했으니 종료는 막지 않는다
  }
  await d.appQuit();
  return true;
}
