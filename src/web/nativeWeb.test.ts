import { describe, expect, it } from "vitest";
import { overlayHits, unobstructed } from "./nativeWeb";

// 107번: 진짜 웹뷰는 앱 위에 그려지므로 가려졌으면 숨긴다
const R = { left: 100, top: 100, right: 500, bottom: 400 };
describe("타일이 가려졌는지", () => {
  const pane = document.createElement("div"), inner = document.createElement("span"), other = document.createElement("div");
  pane.append(inner);
  it("모든 점이 타일 안 요소면 안 가려짐", () => expect(unobstructed(pane, R, () => inner, 1000, 800)).toBe(true));
  it("한 점이라도 다른 요소(크게 보기 콘솔 등)면 가려짐", () => expect(unobstructed(pane, R, (x, y) => (x > 400 && y > 300 ? other : inner), 1000, 800)).toBe(false));
  it("창 밖 점은 빼고, 다 창 밖이면 안 보임", () => {
    expect(unobstructed(pane, { left: -300, top: 100, right: 50, bottom: 400 }, () => inner, 1000, 800)).toBe(true);
    expect(unobstructed(pane, { left: -500, top: 100, right: -100, bottom: 400 }, () => inner, 1000, 800)).toBe(false);
  });
  it("작은 메뉴가 겹치면 가려짐, 안 겹치면 그대로", () => {
    expect(overlayHits(R, [{ left: 480, top: 380, right: 520, bottom: 420 }])).toBe(true);
    expect(overlayHits(R, [{ left: 600, top: 0, right: 700, bottom: 50 }])).toBe(false);
  });
});
