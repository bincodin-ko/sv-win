// S-1365~S-1367
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryFact } from "../lib/ipc";
import { useMemory } from "./useMemory";

const W = window as unknown as { __fakeMemory?: Record<string, MemoryFact[]> };
const R = "C:/r";
const fact = (id: string, scope: "repo" | "all" = "repo"): MemoryFact => ({ id, kind: "Context", title: `T${id}`, body: "b", scope, at: "2026-01-01T00:00:00Z" });
const ids = (k: string) => (W.__fakeMemory![k] ?? []).map((f) => f.id);
beforeEach(() => {
  W.__fakeMemory = { [R]: [fact("1"), fact("2")], _all: [fact("9", "all")] };
  useMemory.setState({ data: {}, tab: "repo", editing: null, delArm: null });
});

describe("불러오기 S-1367", () => {
  it("열 때 repo 와 All 을 함께 읽는다", async () => {
    await useMemory.getState().load(R);
    expect(useMemory.getState().data[R]!.map((f) => f.id)).toEqual(["1", "2"]);
    expect(useMemory.getState().data._all!.map((f) => f.id)).toEqual(["9"]);
  });
  it("repo 가 없으면 All 만 읽는다 S-1377", async () => {
    await useMemory.getState().load(null);
    expect(Object.keys(useMemory.getState().data)).toEqual(["_all"]);
  });
});

describe("저장 S-1364·S-1366", () => {
  it("새 사실은 선택한 범위 파일 끝에 붙는다", async () => {
    await useMemory.getState().load(R);
    await useMemory.getState().save(R, { kind: "Gotchas", title: "New", body: "x", scope: "repo" });
    expect(W.__fakeMemory![R]!.map((f) => f.title)).toEqual(["T1", "T2", "New"]);
    expect(useMemory.getState().data[R]).toHaveLength(3); // 카드 숫자가 바로 바뀐다
  });
  it("범위를 바꿔 저장하면 repo 파일에서 빠지고 _all 로 옮겨 간다", async () => {
    await useMemory.getState().load(R);
    await useMemory.getState().save(R, { id: "1", kind: "Context", title: "T1", body: "b", scope: "all" });
    expect(ids(R)).toEqual(["2"]);
    expect(ids("_all")).toEqual(["9", "1"]);
    expect(W.__fakeMemory!._all!.find((f) => f.id === "1")!.scope).toBe("all");
  });
  it("같은 범위 편집은 제자리에서 바뀐다(순서 유지)", async () => {
    await useMemory.getState().load(R);
    await useMemory.getState().save(R, { id: "1", kind: "Commands", title: "Edited", body: "z", scope: "repo" });
    expect(W.__fakeMemory![R]!.map((f) => f.title)).toEqual(["Edited", "T2"]);
    expect(W.__fakeMemory![R]![0]).toMatchObject({ id: "1", kind: "Commands", body: "z" });
  });
  it("repo 가 없으면 범위 repo 로 와도 All 에 저장 S-1377", async () => {
    await useMemory.getState().load(null);
    await useMemory.getState().save(null, { kind: "Context", title: "G", body: "", scope: "repo" });
    expect(ids("_all")).toHaveLength(2);
  });
  it("편집을 닫으면 저장도 안 되고 폼 상태도 버려진다(편집 중 패널 닫기) S-1366", async () => {
    await useMemory.getState().load(R);
    useMemory.getState().startEdit(fact("1"));
    expect(useMemory.getState().editing).toMatchObject({ id: "1" });
    useMemory.getState().reset();
    expect(useMemory.getState().editing).toBeNull();
    expect(ids(R)).toEqual(["1", "2"]);
  });
  it("새 사실의 기본은 종류 Context, 범위는 선택한 탭", () => {
    useMemory.setState({ tab: "all" });
    useMemory.getState().startNew();
    expect(useMemory.getState().editing).toEqual({ kind: "Context", title: "", body: "", scope: "all" });
  });
});

describe("지우기 S-1365", () => {
  it("첫 클릭은 확인 대기, 두 번째에서 지워지고 파일에서 바로 빠진다", async () => {
    await useMemory.getState().load(R);
    await useMemory.getState().del(R, fact("1"));
    expect(useMemory.getState().delArm).toBe("1");
    expect(ids(R)).toEqual(["1", "2"]);
    await useMemory.getState().del(R, fact("1"));
    expect(ids(R)).toEqual(["2"]);
    expect(useMemory.getState().delArm).toBeNull();
  });
  it("3초 안에 다시 안 누르면 원래대로", async () => {
    vi.useFakeTimers();
    await useMemory.getState().load(R);
    await useMemory.getState().del(R, fact("1"));
    await vi.advanceTimersByTimeAsync(3100);
    expect(useMemory.getState().delArm).toBeNull();
    await useMemory.getState().del(R, fact("1"));
    expect(ids(R)).toEqual(["1", "2"]);
    vi.useRealTimers();
  });
  it("다른 사실을 누르면 대기가 그쪽으로 옮겨 간다(지워지지 않음)", async () => {
    await useMemory.getState().load(R);
    await useMemory.getState().del(R, fact("1"));
    await useMemory.getState().del(R, fact("2"));
    expect(useMemory.getState().delArm).toBe("2");
    expect(ids(R)).toEqual(["1", "2"]);
  });
});

describe("저장 실패 S-1353", () => {
  it("201개째는 거절되고 목록은 이전 그대로, 오류 한 줄", async () => {
    W.__fakeMemory = { [R]: Array.from({ length: 200 }, (_, i) => fact(`f${i}`)) };
    await useMemory.getState().load(R);
    await useMemory.getState().save(R, { kind: "Context", title: "201", body: "", scope: "repo" });
    expect(useMemory.getState().data[R]!.length).toBe(200);
    expect(ids(R).length).toBe(200);
    expect(useMemory.getState().error).toMatch(/^Could not save memory: /);
  });
});
