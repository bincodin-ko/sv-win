// S-2260·S-2261·S-2264·S-2268·S-2274·S-2278 듣기 상태 기계(순수: 시계는 setTimeout·Date.now 뿐) + Space 조건
export type Src = "space" | "mic" | "dict";
export const HOLD_MS = { space: 250, dict: 350 } as const; // 추측(S-2260·S-2274)
export const MIC_HOLD_MS = 400; // 추측(S-2268)
export const LIMIT_MS: Record<Src, number> = { space: 60_000, mic: 60_000, dict: 300_000 };
export interface SpaceIn {
  code: string; repeat: boolean; ctrl: boolean; alt: boolean; meta: boolean; shift: boolean;
  boardShown: boolean; hasKeyboard: boolean; overlay: boolean; studio: boolean; holdSpace: boolean;
}
/** S-2260: 이 keydown 이 Hold Space 의 시작 후보인가 */
export const spaceOk = (i: SpaceIn): boolean =>
  i.code === "Space" && !i.repeat && !i.ctrl && !i.alt && !i.meta && !i.shift && i.boardShown && i.hasKeyboard && !i.overlay && !i.studio && i.holdSpace;

export type EndWhy = "up" | "esc" | "blur" | "limit" | "other" | "abort";
export interface Hooks {
  /** 듣기를 실제로 시작한다. false 면 시작하지 않은 것(준비 안 됨 등) */
  start(src: Src): boolean;
  end(src: Src, send: boolean, why: EndWhy): void;
}

export class Ptt {
  private src: Src | null = null;
  private on = false;
  private toggled = false; // 마이크 버튼: 톡 쳐서 켠 상태(다음 누름이 끝낸다)
  private at = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private h: Hooks) {}
  get active(): Src | null { return this.on ? this.src : null; }
  get busy(): boolean { return this.src !== null; }

  private idle() {
    clearTimeout(this.timer);
    this.src = null;
    this.on = this.toggled = false;
  }
  private begin(src: Src) {
    if (!this.h.start(src)) return this.idle();
    this.on = true;
    this.at = Date.now();
    this.timer = setTimeout(() => this.finish(src === "dict", "limit"), LIMIT_MS[src]); // 60초는 버림, 5분 받아쓰기는 그때까지를 넣음
  }
  private finish(send: boolean, why: EndWhy) {
    const s = this.src!;
    this.idle();
    this.h.end(s, send, why);
  }

  down(src: Src): void {
    if (src === "mic" && this.on && this.src === "mic" && this.toggled) return this.finish(true, "up");
    if (this.busy) return; // 먼저 시작한 것만(둘 동시 금지)
    this.src = src;
    if (src === "mic") return this.begin(src); // 누르자마자 듣는다
    this.timer = setTimeout(() => this.begin(src), HOLD_MS[src]);
  }
  up(src: Src): void {
    if (this.src !== src) return;
    if (!this.on) return this.idle(); // 문턱 전에 뗌 = 톡
    if (src === "mic" && Date.now() - this.at < MIC_HOLD_MS) this.toggled = true;
    else this.finish(true, "up");
  }
  /** 다른 키: 받아쓰기는 단축키로 쓴 것이므로 시작 전이면 안 시작, 시작 뒤면 취소. Space 듣기는 무시 */
  other(): void {
    if (this.src === "dict") this.on ? this.finish(false, "other") : this.idle();
  }
  /** Esc: 듣는 중·누르는 중이면 취소하고 true */
  esc(): boolean {
    if (!this.busy) return false;
    this.on ? this.finish(false, "esc") : this.idle();
    return true;
  }
  blur(): void {
    if (this.on) this.finish(false, "blur");
    else this.idle();
  }
  abort(): void {
    if (this.on) this.finish(false, "abort");
    else this.idle();
  }
}
