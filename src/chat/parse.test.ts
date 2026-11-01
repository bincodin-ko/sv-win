import { describe, expect, it } from "vitest";
import { appendMsgs, lineToMsgs, type Msg } from "./parse";

const J = (o: unknown) => JSON.stringify(o);
const run = (agent: string, lines: unknown[]) => lines.reduce<Msg[]>((acc, l) => appendMsgs(acc, lineToMsgs(agent, J(l))), []);

describe("대기열 1번 채팅 보기 — 대화 기록 읽기", () => {
  it("Claude: 내 말·답·연달은 도구는 한 묶음, tool_result·메타·하위 대화는 숨김", () => {
    const m = run("claude", [
      { type: "user", message: { content: "<command-name>/clear</command-name>" } },
      { type: "user", message: { content: "표 그려줘" } },
      { type: "assistant", message: { content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "확인할게요" }, { type: "tool_use", name: "Bash", input: { command: "ls -la" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", content: "a b c" }] } },
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "C:/x.ts" } }] } },
      { type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "하위" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "끝났어요" }] } },
    ]);
    expect(m).toEqual([
      { role: "user", text: "표 그려줘" },
      { role: "assistant", text: "확인할게요" },
      { role: "tools", tools: [{ name: "Bash", detail: "ls -la" }, { name: "Read", detail: "C:/x.ts" }] },
      { role: "assistant", text: "끝났어요" },
    ]);
  });
  it("Codex: response_item 메시지와 function_call, 환경 안내는 숨김", () => {
    const m = run("codex", [
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>cwd</environment_context>" }] } },
      { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "테스트 돌려줘" }] } },
      { type: "response_item", payload: { type: "function_call", name: "shell", arguments: J({ command: ["npm", "test"] }) } },
      { type: "event_msg", payload: { type: "agent_message", message: "중복이라 무시" } },
      { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "통과했어요" }] } },
    ]);
    expect(m).toEqual([
      { role: "user", text: "테스트 돌려줘" },
      { role: "tools", tools: [{ name: "shell", detail: "npm test" }] },
      { role: "assistant", text: "통과했어요" },
    ]);
  });
  it("깨진 줄은 건너뛴다", () => expect(lineToMsgs("claude", "{bad")).toEqual([]));
});

import { promptOptions } from "./parse";
describe("질문 보기(promptOptions)", () => {
  it("번호 목록은 숫자 키", () => {
    expect(promptOptions(["Do you want to proceed?", "❯ 1. Yes", "  2. No, and tell Claude"])).toEqual([{ label: "1. Yes", keys: "1" }, { label: "2. No, and tell Claude", keys: "2" }]);
  });
  it("번호 없는 목록(설치본 실측: 폴더 신뢰)은 화살표로 옮겨 Enter", () => {
    const l = ["Security guide", "", " ❯ No, exit", "   Yes, I trust this folder", "", " Enter to confirm · Esc to cancel"];
    expect(promptOptions(l)).toEqual([{ label: "No, exit", keys: "\r" }, { label: "Yes, I trust this folder", keys: "\x1b[B\r" }]);
  });
  it("보기가 없으면 빈 목록", () => expect(promptOptions(["그냥 글"])).toEqual([]));
});

import { slashSuggest } from "./parse";
describe("/ 자동완성", () => {
  const names = ["/clear", "/compact", "/context", "/my-skill", "/plug:tool"];
  it("앞이 같은 것", () => expect(slashSuggest("/c", names)).toEqual(["/clear", "/compact", "/context"]));
  it("빈칸 뒤·/ 아님·다 친 것은 없음", () => {
    expect(slashSuggest("/clear x", names)).toEqual([]);
    expect(slashSuggest("hi", names)).toEqual([]);
    expect(slashSuggest("/clear", names)).toEqual([]);
  });
});
