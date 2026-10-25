import { expect, test, type Page } from "@playwright/test";

// 실제 xterm + Chromium 에서 한국어 IME 이벤트 순서를 dispatchEvent 로 재현해 PTY 로 간 글자가 정확히 한 번인지 본다.
// 순서 근거: Chromium 은 조합 중 비한글 키에 keydown(229) → compositionend(data=마지막 글자) → input(insertText, composed) 를 낸다.
const writes = (page: Page) => page.evaluate(() => { const f = (window as any).__fakePty; return (f.writes(f.ids()[0]) as string[]).join(""); });

// 브라우저 대신 textarea 값을 직접 바꾸며 이벤트를 쏜다(조합 글자는 value 에 들어 있다가 확정되면 그대로 남는다)
async function ime(page: Page, steps: string[][]) {
  await page.evaluate(async (steps) => {
    const ta = document.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement;
    ta.focus();
    let base = ta.value;
    let comp = "";
    const tick = () => new Promise((r) => setTimeout(r, 20));
    const key = (type: string, k: string, code: number) => ta.dispatchEvent(new KeyboardEvent(type, { key: k, keyCode: code, which: code, bubbles: true, cancelable: true, composed: true }));
    for (const [op, a] of steps) {
      if (op === "start") { base = ta.value; comp = ""; ta.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true })); }
      else if (op === "update") { comp = a!; ta.value = base + comp; ta.dispatchEvent(new CompositionEvent("compositionupdate", { data: comp, bubbles: true })); ta.dispatchEvent(new InputEvent("input", { data: comp, inputType: "insertCompositionText", isComposing: true, bubbles: true, composed: true })); }
      else if (op === "end") { ta.dispatchEvent(new CompositionEvent("compositionend", { data: a ?? comp, bubbles: true })); comp = ""; }
      else if (op === "text") { ta.value += a!; ta.dispatchEvent(new InputEvent("input", { data: a!, inputType: "insertText", bubbles: true, composed: true })); }
      else if (op === "k229") key("keydown", "Process", 229);
      else if (op === "kdown") key("keydown", a!, a === " " ? 32 : a!.toUpperCase().charCodeAt(0));
      else if (op === "kpress") ta.dispatchEvent(new KeyboardEvent("keypress", { key: a!, charCode: a!.charCodeAt(0), keyCode: a!.charCodeAt(0), bubbles: true, cancelable: true, composed: true }));
      else if (op === "kup") key("keyup", a ?? "Process", 229);
      else if (op === "enter") key("keydown", "Enter", 13);
      else if (op === "bs") key("keydown", "Backspace", 8);
      else if (op === "tick") await tick();
      else if (op === "t0") await new Promise((r) => setTimeout(r, 0));
      if (!["t0", "tick", "end", "kdown", "kpress"].includes(op!)) await new Promise((r) => setTimeout(r, 0)); // 조합 이벤트마다 별개 태스크(end 는 뒤따르는 이벤트와 같은 태스크일 수 있다)
    }
    await tick();
  }, steps);
}
// 한 글자 조합: 초성부터 마지막 글자까지 update 만(끝은 호출자가 정한다)
const syl = (...u: string[]) => [["k229"], ["start"], ...u.map((x) => ["update", x]), ["kup"]] as string[][];

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/?console=1&agent=claude");
  await expect(page.getByTestId("console")).toHaveCount(1);
});

const T = ["t0"];
// 글자 하나 조합 + 확정(다음 글자의 시작이 아니라 뒤따르는 키 때문에): 마지막 글자만 update 하고 끝은 호출자가 넣는다
const plain = (c: string): string[][] => [["kdown", c], ["kup", c]]; // 숫자는 xterm 이 keydown 에서 보내고 preventDefault 해서 keypress·input 이 없다
// 뒤따르는 비한글 키 c 의 이벤트 순서 변형(Chromium·MS IME 가 낼 수 있는 것들). 모두 "요"+c 한 번이어야 한다
const after = (c: string): Record<string, string[][]> => ({
  "229→end→input": [["k229"], ["end"], ["text", c], ["kup"]],
  "229→end→t0→input": [["k229"], ["end"], T, ["text", c], ["kup"]],
  "229→input→end": [["k229"], ["text", c], ["end"], ["kup"]],
  "end→keydown→keypress→input(확정 뒤 키가 그대로 다시 온다)": [["end"], ["kdown", c], ["kpress", c], ["text", c], ["kup", c]],
  "229→end→start→update→end(비한글을 조합으로 보낸다)": [["k229"], ["end"], ["start"], ["update", c], ["end"], ["kup"]],
});
for (const c of ["?", " "]) {
  for (const [name, steps] of Object.entries(after(c))) {
    test(`조합 중 ${JSON.stringify(c)}: ${name} → 정확히 한 번`, async ({ page }) => {
      await ime(page, [...syl("ㅇ", "요"), ...steps, ["tick"]]);
      await page.waitForTimeout(100);
      expect(await writes(page)).toBe("요" + c);
    });
  }
}

test("안녕하세요? — 조합 중 ? 에서 마지막 글자가 두 번 가지 않는다", async ({ page }) => {
  const steps: string[][] = [];
  const word = [["ㅇ", "아", "안"], ["ㄴ", "녀", "녕"], ["ㅎ", "하"], ["ㅅ", "세"], ["ㅇ", "요"]];
  word.forEach((u, i) => { if (i) steps.push(["end"]); steps.push(...syl(...u)); });
  steps.push(["k229"], ["end"], ["text", "?"], ["kup"], ["tick"]);
  await ime(page, steps);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("안녕하세요?");
});

test("안녕 하세요 — 조합 끝 Space 는 한 번, 확정 글자 뒤", async ({ page }) => {
  const steps: string[][] = [...syl("ㅇ", "아", "안"), ["end"], ...syl("ㄴ", "녀", "녕"), ["k229"], ["end"], ["text", " "], ["kup"], ...syl("ㅎ", "하"), ["end"], ...syl("ㅅ", "세"), ["end"], ...syl("ㅇ", "요"), ["end"], ["tick"]];
  await ime(page, steps);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("안녕 하세요");
});

test("가나다. — 조합 중 마침표", async ({ page }) => {
  await ime(page, [...syl("ㄱ", "가"), ["end"], ...syl("ㄴ", "나"), ["end"], ...syl("ㄷ", "다"), ["k229"], ["end"], ["text", "."], ["kup"], ["tick"]]);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("가나다.");
});

test("한글123 — 조합 중 숫자", async ({ page }) => {
  await ime(page, [...syl("ㅎ", "하", "한"), ["end"], ...syl("ㄱ", "그", "글"), ["k229"], ["end"], ["text", "1"], ["kup"], ...plain("2"), ...plain("3"), ["tick"]]);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("한글123");
});

test("조합 중 Enter — 확정 글자 뒤 CR 한 번", async ({ page }) => {
  await ime(page, [...syl("ㅇ", "요"), ["end"], ["enter"], ["tick"]]);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("요\r");
});

test("조합 중 Backspace — 조합만 지우면 아무것도 안 가고, 확정 뒤 Backspace 는 DEL 한 번", async ({ page }) => {
  await ime(page, [...syl("ㄱ", "가"), ["k229"], ["update", "ㄱ"], ["k229"], ["update", ""], ["end", ""], ["tick"]]);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("");
  await ime(page, [...syl("ㅇ", "요"), ["end"], ["bs"], ["tick"]]);
  await page.waitForTimeout(100);
  expect(await writes(page)).toBe("요\x7f");
});
