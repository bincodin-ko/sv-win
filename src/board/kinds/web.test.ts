import { describe, expect, it } from "vitest";
import "./web";
import { getKind, kindsWith } from "./registry";
import { tools } from "../toolsRegistry";
import { makeWeb } from "./web";

// S-1101·S-1113: 웹 타일 종류 등록
describe("web kind (S-1101·S-1113)", () => {
  it("크기·끌기·지우개·고리", () => {
    const k = getKind("web")!;
    expect(k).toBeTruthy();
    expect(k.defaultSize).toEqual({ w: 640, h: 420 });
    expect(k.minSize).toEqual({ w: 320, h: 240 });
    expect(k.bodyDrag).toBe(false);
    expect(k.eraserTarget).toBe(true);
    expect(k.resizable).toBe(true);
    expect(kindsWith("ring").some((x) => x.id === "web" && x.ring!.label === "Insert web")).toBe(true);
    expect(tools().some((t) => t.id === "web" && t.label === "Web tile")).toBe(true);
  });
  it("새 노드: 시작 탭 하나, 확대 100, 기기 null", () => {
    const f = getKind("web")!.create!() as { tabs: { id: string; url: string }[]; active: string; zoom: number; device: string | null };
    expect(f.tabs.length).toBe(1);
    expect(f.tabs[0]!.url).toBe("");
    expect(f.active).toBe(f.tabs[0]!.id);
    expect(f.zoom).toBe(100);
    expect(f.device).toBeNull();
  });
  it("makeWeb(url) = 그 주소로 연 탭", () => {
    const f = makeWeb("http://localhost:3000") as { tabs: { url: string }[] };
    expect(f.tabs[0]!.url).toBe("http://localhost:3000");
  });
});
