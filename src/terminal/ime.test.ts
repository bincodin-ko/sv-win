import { beforeEach, describe, expect, it, vi } from "vitest";
import { hookIme } from "./ime";

// xterm 6 의 숨은 textarea 처리 흉내: input(insertText)은 바로 보내고, compositionend 는 setTimeout(0)에서 textarea 값(조합 시작 이후)을 보낸다(CompositionHelper.ts:170)
function fakeXterm(ta: HTMLTextAreaElement, out: string[]) {
  let start = 0;
  ta.addEventListener("compositionstart", () => { start = ta.value.length; });
  ta.addEventListener("compositionend", () => {
    setTimeout(() => { const v = ta.value.substring(start); if (v) out.push(v); }, 0);
  });
  ta.addEventListener("input", (e) => {
    const ev = e as InputEvent;
    if (ev.inputType === "insertText" && !ev.isComposing && ev.data) out.push(ev.data);
  });
}
// xterm 은 일반 keydown 이면 그 글자를 바로 보낸다
function fakeXtermKeys(ta: HTMLTextAreaElement, out: string[]) {
  ta.addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key.length === 1) out.push((e as KeyboardEvent).key); });
}
const ce = (type: string, data = "") => new CompositionEvent(type, { data, bubbles: true });
const inp = (ta: HTMLTextAreaElement, data: string, inputType = "insertText") => {
  ta.value += data;
  ta.dispatchEvent(new InputEvent("input", { data, inputType, bubbles: true }));
};
const tick = () => new Promise((r) => setTimeout(r, 5));

let ta: HTMLTextAreaElement;
let out: string[];
beforeEach(() => {
  document.body.innerHTML = "";
  ta = document.createElement("textarea");
  document.body.append(ta);
  out = [];
  fakeXterm(ta, out); // xterm 리스너가 먼저 달린다
  hookIme(ta, (d) => out.push(d));
});

// 한 글자를 조합해 확정(다음 글자의 시작이 아니라 Space 로)
const compose = (chars: string, endData: string, spaceAfter: boolean) => {
  ta.value = "";
  ta.dispatchEvent(ce("compositionstart"));
  ta.value = chars;
  ta.dispatchEvent(ce("compositionupdate", chars));
  ta.dispatchEvent(ce("compositionend", endData));
  if (spaceAfter) inp(ta, " ");
};

describe("IME 조합 끝 Space (perf-real ⑥)", () => {
  it("실제 MS IME 순서: compositionend(때) → input(' ') 같은 틱 → '때 ' 한 번, 순서 맞음", async () => {
    compose("않", "않", false); await tick();
    compose("뜰", "뜰", false); await tick();
    compose("때", "때", true);
    await tick();
    expect(out.join("")).toBe("않뜰때 ");
  });
  it("입력 사이 Space: 않뜰 + 때 → '않뜰 때'", async () => {
    compose("않", "않", false); await tick();
    compose("뜰", "뜰", true); await tick(); // 뜰 확정 + Space
    compose("때", "때", false); await tick();
    expect(out.join("")).toBe("않뜰 때");
  });
  it("확정 직후 keydown(32)+input(' ') 둘 다 와도 공백 1개(xterm 이 keydown 으로 보내지 않음)", async () => {
    fakeXtermKeys(ta, out);
    compose("때", "때", false);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: " ", keyCode: 32, bubbles: true }));
    inp(ta, " ");
    await tick();
    expect(out.join("")).toBe("때 ");
  });
  it("확정 직후 keydown(32) 만 와도 공백 1개", async () => {
    fakeXtermKeys(ta, out);
    compose("때", "때", false);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: " ", keyCode: 32, bubbles: true }));
    await tick();
    expect(out.join("")).toBe("때 ");
  });
  it("조합 끝난 뒤 틱이 지난 keydown 은 xterm 으로 간다", async () => {
    fakeXtermKeys(ta, out);
    compose("가", "가", false); await tick();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    expect(out.at(-1)).toBe("b");
  });
  it("CDP 흉내: Space insertText 가 compositionend 보다 먼저 와도 확정 글자가 먼저", async () => {
    ta.dispatchEvent(ce("compositionstart"));
    ta.value = "때";
    ta.dispatchEvent(ce("compositionupdate", "때"));
    inp(ta, " ");
    ta.dispatchEvent(ce("compositionend", "때"));
    await tick();
    expect(out.join("")).toBe("때 ");
  });
  it("조합 아닌 영어 입력·Space 는 그대로 한 번씩", async () => {
    inp(ta, "a"); inp(ta, " ");
    await tick();
    expect(out).toEqual(["a", " "]);
  });
  it("조합이 끝난 뒤 틱이 지나면 다음 input 은 그대로 통과", async () => {
    compose("가", "가", false); await tick();
    inp(ta, "b");
    expect(out.at(-1)).toBe("b");
  });
  it("붙여넣기(paste 이벤트)는 건드리지 않는다", () => {
    const f = vi.fn();
    ta.addEventListener("paste", f);
    ta.dispatchEvent(new Event("paste", { bubbles: true }));
    expect(f).toHaveBeenCalledOnce();
  });
  it("Ctrl 키 keydown 은 건드리지 않는다", () => {
    const f = vi.fn();
    ta.addEventListener("keydown", f);
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }));
    expect(f).toHaveBeenCalledOnce();
  });
});
