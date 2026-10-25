// H4 S-2850·S-2853: 콘솔 cwd 필드 저장·이어받기
import { describe, expect, it } from "vitest";
import { deserialize, serialize, type WorkspaceInfo } from "./persist";
import { makeBoardStore, type ConsoleNode } from "./store";

const WS: WorkspaceInfo = { id: "ws1", name: "W", repoPath: "C:/work/app" };

describe("S-2853 spawn opts.cwd", () => {
  it("spawnConsole·spawnAgent 의 cwd 를 노드에 박고, 없으면 필드가 없다", () => {
    const s = makeBoardStore();
    const a = s.getState().spawnConsole("shell", undefined, { cwd: "D:/x" });
    const b = s.getState().spawnAgent("shell", { x: 2000, y: 0 }, { cwd: "D:/y" });
    const c = s.getState().spawnAgent("shell", { x: 4000, y: 0 });
    expect((s.getState().nodes[a] as ConsoleNode).cwd).toBe("D:/x");
    expect((s.getState().nodes[b] as ConsoleNode).cwd).toBe("D:/y");
    expect(s.getState().nodes[c]).not.toHaveProperty("cwd");
  });
  it("복사/붙여넣기·duplicate 가 cwd 를 이어받는다", () => {
    const s = makeBoardStore();
    const a = s.getState().spawnConsole("shell", undefined, { cwd: "D:/x" });
    s.getState().copy([a]);
    const [p] = s.getState().paste();
    const [d] = s.getState().duplicate([a]);
    expect((s.getState().nodes[p!] as ConsoleNode).cwd).toBe("D:/x");
    expect((s.getState().nodes[d!] as ConsoleNode).cwd).toBe("D:/x");
  });
});

describe("S-2850 저장 왕복", () => {
  it("cwd 가 저장·복원되고 formatVersion 은 1, 없는 옛 파일은 그대로", () => {
    const s = makeBoardStore();
    const a = s.getState().spawnConsole("shell", undefined, { cwd: "D:/x" });
    const b = s.getState().spawnConsole("shell", { x: 3000, y: 0 });
    const text = serialize({ viewport: { x: 0, y: 0, zoom: 1 }, nodes: s.getState().nodes }, WS);
    expect(JSON.parse(text).formatVersion).toBe(1);
    const back = deserialize(text);
    expect((back.nodes[a] as ConsoleNode).cwd).toBe("D:/x");
    expect(back.nodes[b]).not.toHaveProperty("cwd");
  });
});
