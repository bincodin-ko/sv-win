import { describe, expect, it } from "vitest";
import { addItem, cleanTitle, clearDone, editItem, progress, removeItem, toggleItem, type Item } from "./checklist";

const I = (id: string, text: string, done = false): Item => ({ id, text, done });

describe("체크리스트 순수 함수 (S-902~S-905)", () => {
  it("S-902 빈 글·공백만인 항목은 더하지 않는다, 앞뒤 공백은 자른다", () => {
    expect(addItem([], "", "a")).toEqual([]);
    expect(addItem([], "   ", "a")).toEqual([]);
    expect(addItem([I("a", "x")], "  buy milk ", "b")).toEqual([I("a", "x"), I("b", "buy milk")]);
  });
  it("S-902 체크 토글·삭제·글 고치기(빈 글은 취소)", () => {
    const l = [I("a", "x"), I("b", "y")];
    expect(toggleItem(l, "b")).toEqual([I("a", "x"), I("b", "y", true)]);
    expect(toggleItem(toggleItem(l, "b"), "b")).toEqual(l);
    expect(removeItem(l, "a")).toEqual([I("b", "y")]);
    expect(editItem(l, "a", " z ")).toEqual([I("a", "z"), I("b", "y")]);
    expect(editItem(l, "a", "  ")).toEqual(l);
  });
  it("S-903 진행률 N/M·비율, 항목이 없으면 0/0 과 비율 0", () => {
    expect(progress([I("a", "x", true), I("b", "y"), I("c", "z")])).toEqual({ done: 1, total: 3, label: "1/3", ratio: 1 / 3 });
    expect(progress([])).toEqual({ done: 0, total: 0, label: "0/0", ratio: 0 });
  });
  it("S-904 Clear done: 체크한 것만 지우고, 되돌리기용 이전 상태를 같이 돌려준다", () => {
    const l = [I("a", "x", true), I("b", "y"), I("c", "z", true)];
    const r = clearDone(l);
    expect(r.items).toEqual([I("b", "y")]);
    expect(r.prev).toEqual(l);
    expect(clearDone([I("b", "y")]).items).toEqual([I("b", "y")]);
  });
  it("S-905 제목은 40자까지, 빈 값은 취소(이전 제목 유지)", () => {
    expect(cleanTitle("  Groceries ", "Checklist")).toBe("Groceries");
    expect(cleanTitle("x".repeat(60), "Checklist")).toBe("x".repeat(40));
    expect(cleanTitle("   ", "Checklist")).toBe("Checklist");
  });
});
