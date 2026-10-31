import { expect, test, type CDPSession, type Page } from "@playwright/test";

// 실제 Chromium 의 IME 경로: CDP Input.imeSetComposition / insertText / dispatchKeyEvent (final-check fc.mjs composeKoKeys 와 같은 호출).
// 브라우저가 compositionstart/update/end·input·keydown 을 직접 만든다. 발생한 DOM 이벤트는 capture 로그로 남겨 IME_LOG= 로 출력한다.
const writes = (page: Page) => page.evaluate(() => { const f = (window as any).__fakePty; return (f.writes(f.ids()[0]) as string[]).join(""); });
let cdp: CDPSession;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const raw = (code: string) => cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Process", code, windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
const up = (key: string, code: string, vk: number, modifiers = 0) => cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
const comp = (text: string) => cdp.send("Input.imeSetComposition", { text, selectionStart: text.length, selectionEnd: text.length });
const commit = (text: string) => cdp.send("Input.insertText", { text });
const ch = (key: string, code: string, vk: number) => cdp.send("Input.dispatchKeyEvent", { type: "char", key, code, text: key, unmodifiedText: key, windowsVirtualKeyCode: vk });
const plainKey = async (c: string, code: string, vk: number) => { await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: c, code, text: c, unmodifiedText: c, windowsVirtualKeyCode: vk }); await up(c, code, vk); await sleep(40); };

// 음절 하나(자모 키 순서 = [키, 조합 중 글자]) — fc.mjs: keydown 229 → (새 음절이면 앞 글자 insertText) → imeSetComposition → keyUp
async function syl(steps: [string, string, number, string][], prev: string): Promise<string> {
  let cur = prev, first = true;
  for (const [key, code, vk, text] of steps) {
    await raw(code);
    if (first && prev) await commit(prev);
    first = false;
    await comp(text); cur = text;
    await up(key, code, vk);
    await sleep(40);
  }
  return cur;
}
// 조합 중 비한글 키로 끝: keydown 229 → insertText(확정) → char(그 키) → keyUp
async function endWith(cur: string, key: string, code: string, vk: number) {
  await raw(code);
  await commit(cur);
  await ch(key, code, vk);
  await up(key, code, vk);
  await sleep(300);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(1);
  cdp = await page.context().newCDPSession(page);
  await page.evaluate(() => {
    const ta = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
    ta.focus();
    const log: string[] = ((window as any).__imelog = []);
    for (const t of ["keydown", "keypress", "keyup", "compositionstart", "compositionupdate", "compositionend", "input"])
      window.addEventListener(t, (e: any) => log.push(`${t}${e.key !== undefined ? ` key=${e.key} kc=${e.keyCode}` : ""}${e.data != null ? ` data=${JSON.stringify(e.data)}` : ""}${e.inputType ? ` ${e.inputType}` : ""}${e.isComposing ? " comp" : ""} v=${JSON.stringify(ta.value)}`), true);
  });
});
test.afterEach(async ({ page }) => { console.log("IME_LOG\n" + (await page.evaluate(() => (window as any).__imelog.join("\n")))); });

const hello = async () => {
  let c = await syl([["d", "KeyD", 68, "ㅇ"], ["k", "KeyK", 75, "아"], ["s", "KeyS", 83, "안"]], "");
  c = await syl([["s", "KeyS", 83, "ㄴ"], ["u", "KeyU", 85, "녀"], ["d", "KeyD", 68, "녕"]], c);
  c = await syl([["g", "KeyG", 71, "ㅎ"], ["k", "KeyK", 75, "하"]], c);
  c = await syl([["t", "KeyT", 84, "ㅅ"], ["p", "KeyP", 80, "세"]], c);
  return syl([["d", "KeyD", 68, "ㅇ"], ["y", "KeyY", 89, "요"]], c);
};

test("CDP 안녕하세요? — ? 한 번", async ({ page }) => {
  await endWith(await hello(), "?", "Slash", 191);
  expect(await writes(page)).toBe("안녕하세요?");
});
test("CDP 안녕 하세요 — 공백 한 번", async ({ page }) => {
  let c = await syl([["d", "KeyD", 68, "ㅇ"], ["k", "KeyK", 75, "아"], ["s", "KeyS", 83, "안"]], "");
  c = await syl([["s", "KeyS", 83, "ㄴ"], ["u", "KeyU", 85, "녀"], ["d", "KeyD", 68, "녕"]], c);
  await endWith(c, " ", "Space", 32);
  c = await syl([["g", "KeyG", 71, "ㅎ"], ["k", "KeyK", 75, "하"]], "");
  c = await syl([["t", "KeyT", 84, "ㅅ"], ["p", "KeyP", 80, "세"]], c);
  c = await syl([["d", "KeyD", 68, "ㅇ"], ["y", "KeyY", 89, "요"]], c);
  await raw("Enter"); await commit(c); await sleep(200);
  expect(await writes(page)).toBe("안녕 하세요");
});
test("CDP 가나다. — 마침표", async ({ page }) => {
  let c = await syl([["r", "KeyR", 82, "ㄱ"], ["k", "KeyK", 75, "가"]], "");
  c = await syl([["s", "KeyS", 83, "ㄴ"], ["k", "KeyK", 75, "나"]], c);
  c = await syl([["e", "KeyE", 69, "ㄷ"], ["k", "KeyK", 75, "다"]], c);
  await endWith(c, ".", "Period", 190);
  expect(await writes(page)).toBe("가나다.");
});
test("CDP 한글123 — 숫자", async ({ page }) => {
  let c = await syl([["g", "KeyG", 71, "ㅎ"], ["k", "KeyK", 75, "하"], ["s", "KeyS", 83, "한"]], "");
  c = await syl([["r", "KeyR", 82, "ㄱ"], ["m", "KeyM", 77, "그"], ["f", "KeyF", 70, "글"]], c);
  await endWith(c, "1", "Digit1", 49);
  await plainKey("2", "Digit2", 50); await plainKey("3", "Digit3", 51);
  await sleep(100);
  expect(await writes(page)).toBe("한글123");
});
test("CDP 조합 중 Enter", async ({ page }) => {
  const c = await syl([["d", "KeyD", 68, "ㅇ"], ["y", "KeyY", 89, "요"]], "");
  await raw("Enter"); await commit(c);
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: "\r" });
  await up("Enter", "Enter", 13); await sleep(300);
  expect(await writes(page)).toBe("요\r");
});
test("CDP 조합 중 Backspace — 조합만 지우면 아무것도 안 감", async ({ page }) => {
  await syl([["r", "KeyR", 82, "ㄱ"], ["k", "KeyK", 75, "가"]], "");
  await raw("Backspace"); await comp("ㄱ"); await up("Backspace", "Backspace", 8);
  await raw("Backspace"); await comp(""); await up("Backspace", "Backspace", 8);
  await sleep(300);
  expect(await writes(page)).toBe("");
});

// 녹화 rec_1026_235106: Claude 가 일하는 중엔 커서를 숨기고 오른쪽 아래에 둔다 → 조합 글자가 오른쪽 아래에 떴다. 입력 줄 글 끝에 떠야 한다
test("CDP 커서 숨긴 Claude — 조합 글자는 입력 줄에", async ({ page }) => {
  const bar = "─".repeat(30);
  await page.evaluate((s) => { const f = (window as any).__fakePty; f.emit(f.ids()[0], s); },
    `\x1b[2J\x1b[H● Manifesting… (running PreToolUse hooks… 3/4)\r\n${bar}\r\n❯\u00a0ㅇㅇ\r\n${bar}\r\n  bypass permissions on\x1b[?25l\x1b[999;999H`);
  await sleep(300);
  await raw("KeyD"); await comp("ㅇ"); await up("d", "KeyD", 68); await sleep(200);
  const r = await page.evaluate(() => {
    const v = document.querySelector(".composition-view") as HTMLElement, s = (document.querySelector(".xterm-screen") as HTMLElement).getBoundingClientRect();
    const a = v.getBoundingClientRect(), rows = ([...(window as any).__terms.values()][0]).rows as number;
    return { on: v.classList.contains("active"), text: v.textContent, row: Math.round((a.top - s.top) / (s.height / rows)), dx: a.left - s.left, w: s.width };
  });
  console.log("SPOT", JSON.stringify(r));
  expect(r).toMatchObject({ on: true, text: "ㅇ", row: 2 }); // 셋째 줄(❯ 줄)
  expect(r.dx).toBeLessThan(r.w / 3); // 오른쪽 끝이 아니라 "❯ ㅇㅇ" 뒤
  await commit("ㅇ"); await sleep(200);
});

// 대기열 3번: 위로 스크롤해 커서가 화면 밖일 때 조합 상자가 콘솔 왼쪽 위에 떴다. 그리고 바탕화면 터미널처럼 커서는 막대, 조합 글자는 글줄 위(밑줄)로
test("CDP 대기열 3번 — 스크롤해도 조합 글자가 왼쪽 위에 안 뜨고, 글줄처럼 보이며, 커서는 막대", async ({ page }) => {
  await page.evaluate(() => { const f = (window as any).__fakePty; f.emit(f.ids()[0], Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\r\n") + "\r\n$ ab"); });
  await sleep(300);
  await page.evaluate(() => [...(window as any).__terms.values()][0].scrollLines(-30));
  await sleep(200);
  await raw("KeyD"); await comp("ㅇ"); await up("d", "KeyD", 68); await sleep(250);
  const r = await page.evaluate(() => {
    const t = [...(window as any).__terms.values()][0];
    const v = document.querySelector(".composition-view") as HTMLElement, s = (document.querySelector(".xterm-screen") as HTMLElement).getBoundingClientRect();
    const a = v.getBoundingClientRect(), cs = getComputedStyle(v);
    return { on: v.classList.contains("active"), row: Math.round((a.top - s.top) / (s.height / t.rows)), col: Math.round((a.left - s.left) / (s.width / t.cols)), rows: t.rows,
      bg: cs.backgroundColor, deco0: getComputedStyle(v.firstElementChild!).textDecorationLine, theme: (() => { const d = document.createElement("i"); d.style.color = t.options.theme.background; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })(), deco: cs.textDecorationLine, cursor: t.options.cursorStyle, inactive: t.options.cursorInactiveStyle, blink: t.options.cursorBlink };
  });
  console.log("SPOT3", JSON.stringify(r));
  expect(r.on).toBe(true);
  expect(r.row).toBe(r.rows - 1); // 왼쪽 위(0)가 아니라 커서 줄을 화면 안으로 당긴 자리
  expect(r.col).toBe(4);
  expect(r.bg).toBe(r.theme); // 상자가 아니라 터미널 바탕색 위의 글자
  expect(r.deco0).toBe("underline"); // 조합 글자에만 밑줄
  expect([r.cursor, r.inactive, r.blink]).toEqual(["bar", "bar", true]);
  await comp(""); await sleep(100);
});

// 사용자 지적: 조합 중 막대가 글자 앞에 보였고(안ㅣ녕), 글 중간에서 조합하면 오른쪽 글이 가려졌다
test("CDP 조합 중 — 막대는 조합 글자 오른쪽, 오른쪽 글은 뒤로 밀려 보인다", async ({ page }) => {
  await page.evaluate(() => { const f = (window as any).__fakePty; f.emit(f.ids()[0], "[2J[H❯ 가나다라[1;5H"); }); // 커서: '가' 뒤
  await sleep(300);
  await raw("KeyD"); await comp("ㅇ"); await up("d", "KeyD", 68); await sleep(250);
  const r = await page.evaluate(() => {
    const v = document.querySelector(".composition-view") as HTMLElement;
    const kids = [...v.children] as HTMLElement[];
    const caret = v.querySelector(".sv-ime-caret") as HTMLElement;
    const compSpan = kids[0]!, s = (document.querySelector(".xterm-screen") as HTMLElement).getBoundingClientRect();
    const t = [...(window as any).__terms.values()][0], cw = s.width / t.cols;
    return { text: v.textContent, compRight: compSpan.getBoundingClientRect().right, caretX: caret.getBoundingClientRect().left, compLeftCol: Math.round((compSpan.getBoundingClientRect().left - s.left) / cw), restLeftCol: Math.round((kids[2]!.getBoundingClientRect().left - s.left) / cw) };
  });
  console.log("MID", JSON.stringify(r));
  expect(r.text).toBe("ㅇ나다라"); // 오른쪽 글이 사라지지 않음
  expect(r.caretX).toBeGreaterThanOrEqual(r.compRight - 1); // 막대가 조합 글자 오른쪽
  expect(r.compLeftCol).toBe(4); // 조합 글자는 '가' 뒤
  expect(r.restLeftCol).toBe(6); // '나'는 조합 글자(2칸) 뒤로 밀림
  await comp(""); await sleep(100);
});
