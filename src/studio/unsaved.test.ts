import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmUnsaved, setUnsavedAsker, unsaved, type Answer } from "./unsaved";

const mk = (dirty = true, save: () => unknown = () => true) => ({ label: "code", dirty: () => dirty, save: vi.fn(save as () => boolean), discard: vi.fn() });
let ask: ReturnType<typeof vi.fn>;
const answer = (...a: Answer[]) => { ask = vi.fn(); a.forEach((x) => ask.mockResolvedValueOnce(x)); setUnsavedAsker(ask as never); };
beforeEach(() => { unsaved.clear(); answer(); });

describe("S-1810 저장 안 한 편집", () => {
  it("더러운 게 없으면 묻지 않고 계속", async () => {
    unsaved.register("a", mk(false));
    expect(await confirmUnsaved()).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
  it("Save → 저장 호출 후 계속", async () => {
    answer("save");
    const u = mk();
    unsaved.register("a", u);
    expect(await confirmUnsaved()).toBe(true);
    expect(ask).toHaveBeenCalledWith("code");
    expect(u.save).toHaveBeenCalledOnce();
  });
  it("Save 가 실패(false/throw)하면 멈춘다", async () => {
    answer("save", "save");
    unsaved.register("a", mk(true, () => false));
    expect(await confirmUnsaved()).toBe(false);
    unsaved.clear();
    unsaved.register("b", mk(true, () => { throw new Error("disk"); }));
    expect(await confirmUnsaved()).toBe(false);
  });
  it("Don't Save → 버리고 계속, Cancel → 아무것도 안 하고 멈춘다", async () => {
    answer("discard", "cancel");
    const u = mk();
    unsaved.register("a", u);
    expect(await confirmUnsaved()).toBe(true);
    expect(u.discard).toHaveBeenCalledOnce();
    const v = mk();
    unsaved.clear();
    unsaved.register("b", v);
    expect(await confirmUnsaved()).toBe(false);
    expect(v.save).not.toHaveBeenCalled();
    expect(v.discard).not.toHaveBeenCalled();
  });
  it("여럿이면 차례로 묻고 Cancel 에서 멈춘다. register 가 돌려준 함수로 뺀다", async () => {
    answer("save", "cancel");
    const [a, b, c] = [mk(), mk(), mk()];
    unsaved.register("a", a);
    unsaved.register("b", b);
    const off = unsaved.register("c", c);
    off();
    expect(unsaved.dirtyLabels()).toEqual(["code", "code"]);
    expect(await confirmUnsaved()).toBe(false);
    expect(a.save).toHaveBeenCalledOnce();
    expect(c.save).not.toHaveBeenCalled();
  });
});
