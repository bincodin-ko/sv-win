import { beforeEach, describe, expect, it } from "vitest";
import { setExecutor, submit } from "./executor";
import { useThread } from "./thread";

beforeEach(() => { localStorage.clear(); useThread.setState({ byRepo: {}, open: false }); setExecutor(null); });

describe("executor 연결점", () => {
  it("기본 실행기는 내 메시지를 스레드에 남기기만 한다", () => {
    submit("hello", { repo: "r", wsId: "w" });
    const l = useThread.getState().byRepo["r"]!;
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ role: "user", text: "hello" });
  });
  it("등록한 실행기가 글과 repo·워크스페이스를 받는다(내 메시지는 submit 이 이미 남겼다)", () => {
    const got: unknown[] = [];
    setExecutor((t, c) => void got.push([t, c]));
    submit("do x", { repo: "r", wsId: "w" });
    expect(got).toEqual([["do x", { repo: "r", wsId: "w" }]]);
    expect(useThread.getState().byRepo["r"]!.map((m) => m.role)).toEqual(["user"]);
  });
  it("setExecutor(null)이면 기본으로 돌아간다", () => {
    setExecutor(() => { throw new Error("x"); });
    setExecutor(null);
    expect(() => submit("a", { repo: "r", wsId: "w" })).not.toThrow();
  });
});
