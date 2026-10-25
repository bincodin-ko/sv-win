import { describe, expect, it } from "vitest";
import { backHist, canBack, canForward, curHist, forwardHist, newHist, pushHist } from "./history";

// S-1104: 이 타일에서 주소 창·다이얼·빠른 링크로 이동한 기록 안에서 Back/Forward. 시작 탭 = "".
describe("history (S-1104)", () => {
  it("처음엔 시작 탭 하나, 갈 곳 없음", () => {
    const h = newHist();
    expect(curHist(h)).toBe("");
    expect(canBack(h)).toBe(false);
    expect(canForward(h)).toBe(false);
  });
  it("push → Back → Forward", () => {
    let h = pushHist(pushHist(newHist(), "http://a"), "http://b");
    expect(curHist(h)).toBe("http://b");
    expect(canBack(h)).toBe(true);
    h = backHist(h);
    expect(curHist(h)).toBe("http://a");
    expect(canForward(h)).toBe(true);
    h = backHist(h);
    expect(curHist(h)).toBe(""); // 다이얼로 돌아간다
    expect(canBack(h)).toBe(false);
    h = forwardHist(forwardHist(h));
    expect(curHist(h)).toBe("http://b");
    expect(canForward(h)).toBe(false);
  });
  it("Back 한 뒤 새 주소를 열면 앞쪽 기록은 버린다", () => {
    let h = pushHist(pushHist(newHist("http://a"), "http://b"), "http://c");
    h = pushHist(backHist(h), "http://d");
    expect(curHist(h)).toBe("http://d");
    expect(canForward(h)).toBe(false);
    expect(curHist(backHist(h))).toBe("http://b");
  });
  it("탭마다 따로(서로 다른 값)", () => {
    const t1 = pushHist(newHist(), "http://a");
    const t2 = newHist();
    expect(curHist(t1)).toBe("http://a");
    expect(curHist(t2)).toBe("");
  });
  it("끝에서 Back/앞에서 Forward 는 그대로", () => {
    const h = newHist("http://a");
    expect(curHist(backHist(h))).toBe("http://a");
    expect(curHist(forwardHist(h))).toBe("http://a");
  });
});
