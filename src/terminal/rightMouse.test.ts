import { describe, expect, it } from "vitest";
import { guardRightMouse } from "./TerminalView";

// 우클릭은 xterm(안쪽 bubble 리스너)이 마우스 보고를 못 만들게 막고, contextmenu 는 위로 올라가 메뉴가 뜬다. 왼쪽 클릭은 그대로.
const fire = (el: Element, type: string, button: number) => el.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
function setup() {
  const outer = document.createElement("div");
  const root = document.createElement("div"); // term.element
  const inner = document.createElement("div"); // xterm 이 듣는 곳
  root.append(inner); outer.append(root); document.body.append(outer);
  const seen: string[] = [];
  for (const t of ["mousedown", "mouseup"]) inner.addEventListener(t, (e) => seen.push(`${t}${(e as MouseEvent).button}`));
  outer.addEventListener("contextmenu", () => seen.push("menu"));
  guardRightMouse(root);
  return { inner, seen };
}
describe("guardRightMouse", () => {
  it("우클릭 mousedown/mouseup 은 xterm 에 안 간다", () => {
    const { inner, seen } = setup();
    fire(inner, "mousedown", 2); fire(inner, "mouseup", 2);
    expect(seen).toEqual([]);
  });
  it("contextmenu 는 위로 올라가 메뉴가 뜬다", () => {
    const { inner, seen } = setup();
    fire(inner, "contextmenu", 2);
    expect(seen).toEqual(["menu"]);
  });
  it("왼쪽 클릭은 그대로 간다", () => {
    const { inner, seen } = setup();
    fire(inner, "mousedown", 0); fire(inner, "mouseup", 0);
    expect(seen).toEqual(["mousedown0", "mouseup0"]);
  });
});
