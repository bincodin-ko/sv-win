// 9묶음 P2 저사양: 콘솔 출력 묶음 write · WebGL 지연 떼기 · 스크롤백.
import { isLowSpec } from "../perf/lowSpec";

export const LOW_SPEC_BATCH_MS = 66;
export const HIDDEN_BATCH_MS = 100; // 창이 숨겨져 rAF 가 안 올 때의 대체 간격
export const GESTURE_QUIET_MS = 150;
export const GL_DETACH_DELAY_MS = 10_000;

/** S-106 기본 1만 줄, 저사양 3000줄 */
export const scrollbackFor = (low: boolean): number => (low ? 3000 : 10000);

export interface BatchOpts {
  lowSpec?: () => boolean;
  /** 보드 팬·줌 중인가(저사양에서만 쓴다) */
  gesturing?: () => boolean;
  hidden?: () => boolean;
  raf?: (cb: () => void) => number;
  caf?: (n: number) => void;
}
export interface BatchWriter {
  push(b: Uint8Array): void;
  /** 쌓인 것을 기다리지 않고 순서대로 바로 쓴다(다른 글을 xterm 에 쓰기 전에 부른다) */
  flush(): void;
  dispose(): void;
}

/** 조각을 모았다가 기본은 프레임당 1번, 저사양은 66ms 마다 1번 write 한다. 바이트는 버리지 않고 순서를 지킨다. */
export function createBatchWriter(write: (b: Uint8Array) => void, o: BatchOpts = {}): BatchWriter {
  const low = o.lowSpec ?? isLowSpec;
  const gesturing = o.gesturing ?? (() => false);
  const hidden = o.hidden ?? (() => typeof document !== "undefined" && document.hidden);
  const raf = o.raf ?? ((cb) => requestAnimationFrame(cb));
  const caf = o.caf ?? ((n) => cancelAnimationFrame(n));
  let q: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    if (frame !== undefined) caf(frame);
    frame = undefined;
  };
  const arm = (gestureWait = false) => {
    if (gestureWait) timer = setTimeout(fire, GESTURE_QUIET_MS);
    else if (low()) timer = setTimeout(fire, LOW_SPEC_BATCH_MS);
    else if (hidden()) timer = setTimeout(fire, HIDDEN_BATCH_MS); // 숨은 창은 rAF 가 멈춘다
    else frame = raf(fire);
  };
  function fire() {
    timer = undefined;
    frame = undefined;
    // ponytail: 제스처가 길어지면 그만큼 쌓인다(손실 없음). 상한이 필요하면 첫 push 시각으로 최대 지연을 둔다
    if (low() && gesturing()) return arm(true);
    flush();
  }
  function flush() {
    cancel();
    if (!q.length) return;
    const parts = q;
    q = [];
    if (parts.length === 1) return write(parts[0]!);
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) (out.set(p, at), (at += p.length));
    write(out);
  }
  return {
    push(b) {
      q.push(b);
      if (timer === undefined && frame === undefined) arm();
    },
    flush,
    dispose() {
      cancel();
      q = [];
    },
  };
}

export interface GlGate {
  /** 보이는지 알린다. 보이면 바로 붙이고(이미 붙었거나 떼기 예약이 있으면 예약만 취소), 안 보이면 delay 뒤에 뗀다(now = 워크스페이스가 숨겨진 것: 바로 뗀다) */
  set(visible: boolean, now?: boolean): void;
  dispose(): void;
}

/** attach 가 null 을 돌려주면 자리가 없는 것 — 다음 set(true) 때 다시 시도한다. */
export function createGlGate(attach: () => (() => void) | null, delay = GL_DETACH_DELAY_MS): GlGate {
  let detach: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drop = () => {
    clearTimeout(timer);
    timer = undefined;
    detach?.();
    detach = null;
  };
  return {
    set(visible, now = false) {
      if (visible) {
        clearTimeout(timer);
        timer = undefined;
        detach ??= attach();
      } else if (now) drop();
      else if (detach && timer === undefined) timer = setTimeout(drop, delay);
    },
    dispose: drop,
  };
}
