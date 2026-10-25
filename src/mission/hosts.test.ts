import { describe, expect, it } from "vitest";
import LoopsHost from "../loops/LoopsHost";
import MemoryHost from "../memory/MemoryHost";
import MissionHost from "./MissionHost";

// D1 S-1234: 호스트 3개(AppShell 조립 한 줄씩은 e2e/wired.spec.ts 가 앱을 띄워 확인). D7·D8·D9가 채워 훅을 쓰므로 직접 호출하지 않고 함수인지만 본다
describe("S-1234 호스트", () => {
  it("세 호스트는 함수", () => {
    for (const H of [MissionHost, MemoryHost, LoopsHost]) expect(typeof H).toBe("function");
  });
});
