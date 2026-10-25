import { describe, expect, it } from "vitest";
import { sessionKey } from "./sessionKey";

describe("S-303 (워크스페이스 id, 노드 id) 합성 키", () => {
  it("같은 노드 id c1 이라도 워크스페이스가 다르면 키가 다르다", () => {
    expect(sessionKey("ws-a", "c1")).not.toBe(sessionKey("ws-b", "c1"));
  });
  it("같은 (워크스페이스, 노드)는 언제나 같은 키", () => {
    expect(sessionKey("ws-a", "c1")).toBe(sessionKey("ws-a", "c1"));
  });
  it("같은 워크스페이스의 다른 노드는 키가 다르다", () => {
    expect(sessionKey("ws-a", "c1")).not.toBe(sessionKey("ws-a", "c2"));
  });
  it("경계가 모호하지 않다: ('a','b:c') 와 ('a:b','c') 가 같은 키가 되지 않는다", () => {
    expect(sessionKey("a", "b:c")).not.toBe(sessionKey("a:b", "c"));
  });
});
