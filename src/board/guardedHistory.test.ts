import { beforeEach, describe, expect, it, vi } from "vitest";

const running = new Set<string>();
const confirm = vi.fn<(names: string[]) => Promise<boolean>>();
vi.mock("../console/session", () => ({ getSession: (_ws: string, id: string) => (running.has(id) ? { isRunning: () => true } : undefined) }));
vi.mock("../console/ConfirmClose", () => ({ confirmClose: (n: string[]) => confirm(n) }));

import { requestHistory } from "./guardedHistory";
import { useBoard } from "./store";

const sc = { wsId: "ws", store: useBoard };
const st = () => useBoard.getState();
beforeEach(() => {
  running.clear();
  confirm.mockReset();
  useBoard.setState({ nodes: {}, groups: [], selection: [], viewport: { x: 0, y: 0, zoom: 1 }, history: { past: [], future: [] } });
});

describe("되돌리기가 실행 중 콘솔을 지울 때", () => {
  it("확인창에 이름들을 보내고, 확인하면 되돌린다", async () => {
    const { ids } = st().spawnMany(["shell", "shell"], { x: 0, y: 0 }); // 프리셋 배치 = 1단계
    ids.forEach((i) => running.add(i));
    confirm.mockResolvedValue(true);
    expect(await requestHistory("undo", sc)).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0]![0]).toHaveLength(2);
    expect(Object.keys(st().nodes)).toHaveLength(0);
  });
  it("취소하면 노드가 남고 되돌리기 칸도 그대로", async () => {
    const id = st().spawnConsole("shell", { x: 0, y: 0 });
    running.add(id);
    confirm.mockResolvedValue(false);
    expect(await requestHistory("undo", sc)).toBe(false);
    expect(st().nodes[id]).toBeDefined();
    expect(st().history.past).toHaveLength(1);
  });
  it("실행 중이 아니면 확인창 없이 되돌린다", async () => {
    const id = st().spawnConsole("shell", { x: 0, y: 0 });
    expect(await requestHistory("undo", sc)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(st().nodes[id]).toBeUndefined();
  });
  it("다시 실행이 실행 중 콘솔을 지우게 되면 같은 확인창, 취소하면 그대로", async () => {
    const id = st().spawnConsole("shell", { x: 0, y: 0 });
    st().removeNodes([id]);
    st().undo(); // 콘솔 복귀, future 에 '없는' 상태
    running.add(id);
    confirm.mockResolvedValue(false);
    expect(await requestHistory("redo", sc)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(st().nodes[id]).toBeDefined();
    confirm.mockResolvedValue(true);
    expect(await requestHistory("redo", sc)).toBe(true);
    expect(st().nodes[id]).toBeUndefined();
  });
});
