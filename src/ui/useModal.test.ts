// @vitest-environment jsdom
import { createElement as h, useRef, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModal } from "./useModal";

// U1 S-2600~S-2603: 열 때 안으로 포커스·Tab 가두기·Esc(포커스 무관, 맨 위 하나)·닫으면 복원
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
function Dlg({ id, onClose, initialFocus }: { id: string; onClose: () => void; initialFocus?: () => HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, initialFocus ? { onClose, initialFocus } : { onClose });
  return h("div", { ref, role: "dialog", id }, h("button", { id: id + "a" }, "a"), h("button", { id: id + "b" }, "b"));
}
let host: HTMLDivElement, root: Root, opener: HTMLButtonElement;
const render = (el: any) => act(() => root.render(el));
const key = (k: string, shiftKey = false) => act(() => { document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true })); });
const active = () => document.activeElement?.id;
beforeEach(() => {
  document.body.innerHTML = "";
  opener = document.createElement("button"); opener.id = "opener"; document.body.append(opener); opener.focus();
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

describe("useModal", () => {
  it("S-2600 열면 첫 단추로 포커스, initialFocus 가 있으면 그쪽", async () => {
    await render(h(Dlg, { id: "x", onClose() {} }));
    expect(active()).toBe("xa");
    await render(null);
    await render(h(Dlg, { id: "y", onClose() {}, initialFocus: () => document.getElementById("yb") }));
    expect(active()).toBe("yb");
  });
  it("S-2601 Tab 은 끝에서 처음으로, Shift+Tab 은 처음에서 끝으로 돈다", async () => {
    await render(h(Dlg, { id: "x", onClose() {} }));
    document.getElementById("xb")!.focus();
    await key("Tab");
    expect(active()).toBe("xa");
    await key("Tab", true);
    expect(active()).toBe("xb");
  });
  it("S-2601 포커스가 밖에 있어도 Tab 하면 안으로 들어온다", async () => {
    await render(h(Dlg, { id: "x", onClose() {} }));
    opener.focus();
    await key("Tab");
    expect(document.getElementById("x")!.contains(document.activeElement)).toBe(true);
  });
  it("S-2602 포커스가 밖(body)이어도 Esc 한 번에 onClose 한 번", async () => {
    const close = vi.fn();
    await render(h(Dlg, { id: "x", onClose: close }));
    (document.activeElement as HTMLElement).blur();
    await act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })); });
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("S-2602 대화상자가 둘이면 Esc 는 맨 위(나중에 연) 하나만 닫는다", async () => {
    const a = vi.fn(), b = vi.fn();
    await render(h("div", null, h(Dlg, { id: "p", onClose: a }), h(Dlg, { id: "q", onClose: b })));
    await key("Escape");
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });
  it("S-2603 닫으면 열기 전 요소로 포커스가 돌아간다", async () => {
    await render(h(Dlg, { id: "x", onClose() {} }));
    expect(active()).toBe("xa");
    await render(null);
    expect(active()).toBe("opener");
  });
  it("S-2603 열기 전 요소가 사라졌으면 그냥 둔다", async () => {
    await render(h(Dlg, { id: "x", onClose() {} }));
    opener.remove();
    await render(null);
    expect(active()).toBe(""); // body
  });
});
