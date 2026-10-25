import { describe, expect, it } from "vitest";
import { DEVICES, fitDevice } from "./devices";

// S-1108: 메뉴 = Fit tile + DISPLAYS 3 + PHONES 5. 표(DEVICES)는 크기가 있는 8개.
describe("DEVICES (S-1108)", () => {
  it("크기와 이름이 명세대로", () => {
    expect(DEVICES.map((d) => [d.label, d.w, d.h, d.group])).toEqual([
      ["24 in monitor", 1920, 1080, "DISPLAYS"],
      ["27 in monitor", 2560, 1440, "DISPLAYS"],
      ["32 in 4K", 3840, 2160, "DISPLAYS"],
      ["iPhone SE", 375, 667, "PHONES"],
      ["iPhone 14 Pro", 393, 852, "PHONES"],
      ["iPhone 14 Pro Max", 430, 932, "PHONES"],
      ["Pixel 7", 412, 915, "PHONES"],
      ["Galaxy S8+", 360, 740, "PHONES"],
    ]);
    expect(new Set(DEVICES.map((d) => d.id)).size).toBe(8);
  });
});
describe("fitDevice: 비율을 지켜 가운데로 축소", () => {
  it("가로가 더 막히면 가로 기준", () => {
    const f = fitDevice({ w: 1920, h: 1080 }, { w: 960, h: 600 });
    expect(f.scale).toBeCloseTo(0.5, 6);
    expect(f.left).toBeCloseTo(0, 6);
    expect(f.top).toBeCloseTo((600 - 540) / 2, 6);
  });
  it("세로가 더 막히면 세로 기준 + 가로 가운데", () => {
    const f = fitDevice({ w: 375, h: 667 }, { w: 640, h: 300 });
    expect(f.scale).toBeCloseTo(300 / 667, 6);
    expect(f.left).toBeCloseTo((640 - 375 * (300 / 667)) / 2, 6);
    expect(f.top).toBeCloseTo(0, 6);
  });
  it("영역보다 작으면 키우지 않고(1배) 가운데", () => {
    const f = fitDevice({ w: 375, h: 667 }, { w: 800, h: 900 });
    expect(f.scale).toBe(1);
    expect(f.left).toBe((800 - 375) / 2);
    expect(f.top).toBe((900 - 667) / 2);
  });
});
