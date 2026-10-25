import { beforeEach, describe, expect, it } from "vitest";
import { clearTasks, recordTask, taskOf, TASK_MAX } from "./tasks";

beforeEach(clearTasks);
describe("S-1311 작업 라벨", () => {
  it("콘솔·그룹·카드 id 에 같은 주문을 기록한다", () => {
    recordTask(["c1", "g1", "o1"], "fix the login bug", 5);
    for (const k of ["c1", "g1", "o1"]) expect(taskOf(k)).toEqual({ text: "fix the login bug", at: 5 });
  });
  it("undefined 키는 건너뛴다", () => {
    recordTask(["c1", undefined], "x", 1);
    expect(taskOf("c1")?.text).toBe("x");
  });
  it("나중 주문이 덮는다", () => {
    recordTask(["c1"], "first", 1);
    recordTask(["c1"], "second", 2);
    expect(taskOf("c1")).toEqual({ text: "second", at: 2 });
  });
  it("600자까지만", () => {
    expect(TASK_MAX).toBe(600);
    recordTask(["c1"], "a".repeat(700), 1);
    expect(taskOf("c1")!.text).toHaveLength(600);
  });
  it("기록 없으면 undefined", () => expect(taskOf("none")).toBeUndefined());
});
