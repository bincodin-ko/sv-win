import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme } from "./theme";

const attr = () => document.documentElement.getAttribute("data-theme");

// 가짜 matchMedia: dark 값을 바꾸고 change 를 알린다
function fakeMedia(dark: boolean) {
  const subs = new Set<() => void>();
  const mq = {
    get matches() { return dark; },
    addEventListener: (_: string, f: () => void) => subs.add(f),
    removeEventListener: (_: string, f: () => void) => subs.delete(f),
  };
  window.matchMedia = (() => mq) as unknown as typeof window.matchMedia;
  return { set: (d: boolean) => { dark = d; subs.forEach((f) => f()); }, count: () => subs.size };
}

beforeEach(() => document.documentElement.removeAttribute("data-theme"));

describe("S-360/S-361 applyTheme", () => {
  it("og·light 는 data-theme 속성", () => {
    fakeMedia(true);
    applyTheme("light");
    expect(attr()).toBe("light");
    applyTheme("og");
    expect(attr()).toBe("og");
  });
  it("system 은 OS 밝기를 따르고 바뀌면 같이 바뀐다", () => {
    const m = fakeMedia(true);
    applyTheme("system");
    expect(attr()).toBe("og");
    m.set(false);
    expect(attr()).toBe("light");
    m.set(true);
    expect(attr()).toBe("og");
  });
  it("system 을 떠나면 감시가 멈춘다", () => {
    const m = fakeMedia(true);
    applyTheme("system");
    applyTheme("light");
    expect(m.count()).toBe(0);
    m.set(true);
    expect(attr()).toBe("light");
  });
});
