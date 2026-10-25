import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ptt, spaceOk, type EndWhy, type Hooks, type SpaceIn, type Src } from "./ptt";

// F3 S-2260·S-2261·S-2264·S-2268·S-2294: Space 조건 표 + 듣기 상태 기계(가짜 시계)
const base: SpaceIn = { code: "Space", repeat: false, ctrl: false, alt: false, meta: false, shift: false, boardShown: true, hasKeyboard: true, overlay: false, studio: false, holdSpace: true };
describe("Space 조건 표 (S-2260 12가지)", () => {
  it("기본은 시작 가능", () => expect(spaceOk(base)).toBe(true));
  const no: [string, Partial<SpaceIn>][] = [
    ["Ctrl", { ctrl: true }], ["Alt", { alt: true }], ["Meta", { meta: true }], ["Shift", { shift: true }],
    ["입력란·콘솔이 키보드를 가짐", { hasKeyboard: false }], ["열린 메뉴·대화상자", { overlay: true }], ["스튜디오 열림", { studio: true }],
    ["홈(보드 없음)", { boardShown: false }], ["holdSpace 꺼짐", { holdSpace: false }], ["키 반복(repeat)", { repeat: true }], ["Space 아닌 키", { code: "KeyA" }],
  ];
  for (const [name, p] of no) it(`${name} 이면 시작 안 함`, () => expect(spaceOk({ ...base, ...p })).toBe(false));
  it("S-2267 카드를 선택만 한 상태(키보드는 보드)면 명령 바로 말한다 = 시작 가능", () => expect(spaceOk({ ...base, hasKeyboard: true })).toBe(true));
});

let log: string[];
let startOk: boolean;
const hooks: Hooks = {
  start: (s: Src) => (log.push(`start:${s}`), startOk),
  end: (s: Src, send: boolean, why: EndWhy) => void log.push(`end:${s}:${send ? "send" : "drop"}:${why}`),
};
let p: Ptt;
beforeEach(() => { vi.useFakeTimers(); log = []; startOk = true; p = new Ptt(hooks); });
afterEach(() => vi.useRealTimers());
const t = (ms: number) => vi.advanceTimersByTime(ms);

describe("Hold Space 듣기 (S-2260·S-2261)", () => {
  it("250ms 미만 톡 치기는 아무 일도 안 한다", () => {
    p.down("space"); t(249); p.up("space"); t(1000);
    expect(log).toEqual([]);
    expect(p.busy).toBe(false);
  });
  it("250ms 넘게 누르면 시작, 놓으면 전송", () => {
    p.down("space"); t(250);
    expect(log).toEqual(["start:space"]);
    expect(p.active).toBe("space");
    p.up("space");
    expect(log).toEqual(["start:space", "end:space:send:up"]);
    expect(p.busy).toBe(false);
  });
  it("듣는 동안 다른 키는 무시, Esc 는 취소(버림)", () => {
    p.down("space"); t(300); p.other();
    expect(p.active).toBe("space");
    expect(p.esc()).toBe(true);
    expect(log.at(-1)).toBe("end:space:drop:esc");
    expect(p.esc()).toBe(false); // 이미 끝남 → 다음 Esc 는 다른 곳으로
  });
  it("누르는 도중 Esc 도 취소(시작 안 함)", () => {
    p.down("space"); t(100);
    expect(p.esc()).toBe(true);
    t(500);
    expect(log).toEqual([]);
  });
  it("창이 포커스를 잃으면 취소", () => {
    p.down("space"); t(300); p.blur();
    expect(log.at(-1)).toBe("end:space:drop:blur");
    p.down("space"); t(100); p.blur(); t(500); // 시작 전 블러
    expect(log.filter((l) => l.startsWith("start")).length).toBe(1);
  });
  it("start 가 false(준비 안 됨·마이크 오류)면 듣기에 들어가지 않고 end 도 없다", () => {
    startOk = false;
    p.down("space"); t(300);
    expect(log).toEqual(["start:space"]);
    expect(p.busy).toBe(false);
    p.up("space");
    expect(log).toEqual(["start:space"]);
  });
  it("S-2264 60초에 닿으면 끝내고 보내지 않는다", () => {
    p.down("space"); t(250); t(59_000);
    expect(p.active).toBe("space");
    t(1000);
    expect(log.at(-1)).toBe("end:space:drop:limit");
    p.up("space");
    expect(log.length).toBe(2);
  });
});

describe("마이크 버튼 (S-2268)", () => {
  it("400ms 넘게 누르면 누르는 동안 듣고 놓으면 전송", () => {
    p.down("mic");
    expect(log).toEqual(["start:mic"]); // 누르자마자 듣기
    t(401); p.up("mic");
    expect(log.at(-1)).toBe("end:mic:send:up");
  });
  it("짧게 눌렀다 떼면 계속 듣고, 다시 한 번 누르면 멈추고 전송", () => {
    p.down("mic"); t(100); p.up("mic");
    expect(p.active).toBe("mic");
    t(5000);
    p.down("mic");
    expect(log.at(-1)).toBe("end:mic:send:up");
    p.up("mic");
    expect(log.length).toBe(2);
  });
  it("Esc 는 취소, 60초 미전송", () => {
    p.down("mic"); t(100); p.up("mic");
    expect(p.esc()).toBe(true);
    expect(log.at(-1)).toBe("end:mic:drop:esc");
    p.down("mic"); t(50); p.up("mic"); t(60_000);
    expect(log.at(-1)).toBe("end:mic:drop:limit");
  });
});

describe("받아쓰기 키 (S-2274·S-2278)", () => {
  it("350ms 넘게 누르면 시작, 놓으면 보냄(글을 넣음)", () => {
    p.down("dict"); t(349);
    expect(log).toEqual([]);
    t(1);
    expect(log).toEqual(["start:dict"]);
    p.up("dict");
    expect(log.at(-1)).toBe("end:dict:send:up");
  });
  it("그 사이 다른 키(단축키로 쓴 것)면 시작하지 않는다", () => {
    p.down("dict"); t(200); p.other(); t(1000);
    expect(log).toEqual([]);
    expect(p.busy).toBe(false);
  });
  it("시작한 뒤 다른 키·Esc 는 취소", () => {
    p.down("dict"); t(400); p.other();
    expect(log.at(-1)).toBe("end:dict:drop:other");
    p.down("dict"); t(400);
    expect(p.esc()).toBe(true);
    expect(log.at(-1)).toBe("end:dict:drop:esc");
  });
  it("5분 한도: 멈추고 그때까지 말한 것을 넣는다(보냄)", () => {
    p.down("dict"); t(350); t(299_000);
    expect(p.active).toBe("dict");
    t(1000);
    expect(log.at(-1)).toBe("end:dict:send:limit");
  });
  it("창 블러면 취소", () => {
    p.down("dict"); t(400); p.blur();
    expect(log.at(-1)).toBe("end:dict:drop:blur");
  });
});

describe("Hold Space 와 받아쓰기는 동시에 안 돈다 (먼저 시작한 것만)", () => {
  it("Space 가 먼저면 받아쓰기 키는 무시", () => {
    p.down("space"); t(300); p.down("dict"); t(400);
    expect(log).toEqual(["start:space"]);
    p.up("dict");
    expect(p.active).toBe("space");
  });
  it("받아쓰기가 먼저면 Space 는 무시", () => {
    p.down("dict"); t(400); p.down("space"); t(300);
    expect(log).toEqual(["start:dict"]);
  });
  it("둘 다 누르는 중(아직 시작 전)이면 먼저 누른 것만", () => {
    p.down("space"); t(100); p.down("dict"); t(300);
    expect(log).toEqual(["start:space"]);
  });
});
