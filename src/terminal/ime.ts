// 한글 조합 끝 Space 순서 고침(perf-real ⑥)
// xterm 은 compositionend 확정을 setTimeout(0)으로 미루고(CompositionHelper.ts:170) 그 사이 도착한 input(' ')은 바로 보낸다 → 공백이 확정 글자보다 먼저 가고 textarea 값("때 ")이 또 가서 공백이 둘.
// 한글 조합~확정 글자는 우리 쪽 한 길로만 보낸다(xterm 의 확정 전송·textarea diff 는 막는다: 둘이 같이 보내면 "요?요?" 처럼 두 번 간다).
// 해결: 조합 중~확정 직후(같은 틱)의 input 을 capture 에서 가로채 모았다가, xterm 의 타이머보다 먼저 도는 우리 타이머에서 [확정 글자 + 모은 글자]를 한 번에 보내고 textarea 를 비워 xterm 이 또 보내지 않게 한다.
// mute: xterm 의 대기 중 확정 전송(CompositionHelper 의 setTimeout)을 취소한다. 우리가 이미 보낸 글자를 xterm 이 textarea 에서 또 읽지 못하게.
export function hookIme(ta: HTMLTextAreaElement, send: (d: string) => void, mute: () => void = () => {}): () => void {
  // xterm 은 keydown·keypress·input 을 textarea 에 capture 로 먼저 달았다 → 우리는 한 단계 위(조상) capture 에서 받아야 먼저 돈다
  const top = ta.parentElement ?? ta;
  let open = false; // 조합 시작 ~ 우리 타이머까지
  let final: string | null = null; // compositionend 의 확정 글자
  let extra = "";
  let keyed = ""; // 확정 직후 keydown 으로 이미 모은 글자(뒤따르는 같은 input 은 건너뛴다)
  let pressed = false; // 이 키에 keypress 가 이미 왔다 → xterm 이 보냈으니 input 은 건너뛴다(실제 Chromium: 229 keydown → compositionend → keypress(keydown 없음) → input(insertText))
  let last229 = false; // 마지막 keydown 이 IME(229)였다 → 뒤따르는 input 은 keypress 가 없어 xterm 이 안 보낸다(composed input 은 무시) → 우리가 보낸다
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const out = (final ?? "") + extra;
    open = false;
    final = null;
    extra = "";
    keyed = "";
    ta.value = "";
    mute();
    if (out) send(out);
  };
  const start = () => { if (timer !== undefined) { clearTimeout(timer); flush(); } open = true; };
  const end = (e: Event) => {
    final = (e as CompositionEvent).data ?? "";
    timer = setTimeout(flush, 0); // capture 라 xterm 의 setTimeout 보다 먼저 등록된다
  };
  const input = (e: Event) => {
    const ev = e as InputEvent;
    if (ev.inputType !== "insertText" || !ev.data) return;
    if (!open) {
      if (last229 && !pressed) { ev.stopImmediatePropagation(); send(ev.data); } // 확정 뒤 늦게 온 비한글(229 keydown 의 글자)
      return;
    }
    if (keyed === ev.data) keyed = "";
    else extra += ev.data;
    ev.stopImmediatePropagation(); // xterm 이 먼저 보내지 않게
  };
  ta.addEventListener("compositionstart", start, true);
  ta.addEventListener("compositionend", end, true);
  // 확정 직후(타이머 전) 인쇄 가능한 keydown(Space 등)은 xterm 이 따로 보내지 않게 막고 우리 큐 한 곳으로만 보낸다
  const keydown = (e: Event) => {
    const ev = e as KeyboardEvent;
    last229 = ev.keyCode === 229;
    pressed = false;
    if (timer === undefined) return;
    // 확정 직후(타이머 전)에 Enter·Backspace 같은 키가 오면 확정 글자를 먼저 보내고 비운다(xterm 이 keydown 에서 textarea 를 읽어 또 보내지 않게)
    if (ev.keyCode === 229 || ev.isComposing) return;
    if (ev.key.length !== 1 || ev.ctrlKey || ev.altKey || ev.metaKey) return flush();
    extra += ev.key;
    keyed = ev.key;
    ev.preventDefault(); // 뒤따르는 keypress 가 없게
    ev.stopImmediatePropagation();
  };
  // 확정 직후(타이머 전) keypress: keydown 이 이미 모았으면 keypress 가 안 온다 → 여기 온 글자는 아직 아무도 안 모은 것. 막기만 하면 사라진다(조합 화면이 무거워져 타이머가 늦을 때 '.'·'?' 가 빠졌다) → 큐에 넣는다
  const keypress = (e: Event) => {
    pressed = true;
    if (timer === undefined) return;
    const ev = e as KeyboardEvent;
    if (keyed !== ev.key && ev.key.length === 1 && !ev.ctrlKey && !ev.altKey && !ev.metaKey) { extra += ev.key; keyed = ev.key; } // keydown 이 이미 모은 같은 키면 건너뜀
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  top.addEventListener("keypress", keypress, true);
  top.addEventListener("keydown", keydown, true);
  top.addEventListener("input", input, true);
  return () => {
    clearTimeout(timer);
    ta.removeEventListener("compositionstart", start, true);
    ta.removeEventListener("compositionend", end, true);
    top.removeEventListener("keydown", keydown, true);
    top.removeEventListener("keypress", keypress, true);
    top.removeEventListener("input", input, true);
  };
}
