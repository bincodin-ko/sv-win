import { describe, expect, it } from "vitest";
import { CLAUDE_CODE_FIELDS, UPLOAD_FIELDS, fieldKind } from "./fields";

describe("S-2077 필드 표", () => {
  it("Claude Code 가 아는 14개", () => {
    expect([...CLAUDE_CODE_FIELDS].sort()).toEqual(
      ["name", "description", "when_to_use", "argument-hint", "disable-model-invocation", "user-invocable", "allowed-tools", "model", "effort", "context", "agent", "hooks", "paths", "shell"].sort());
  });
  it("업로드가 받는 것은 name·description(+license·compatibility·metadata)", () => {
    expect([...UPLOAD_FIELDS].sort()).toEqual(["compatibility", "description", "license", "metadata", "name"]);
  });
  it("분류: shared · code-only · unknown", () => {
    expect(fieldKind("name")).toBe("shared");
    expect(fieldKind("description")).toBe("shared");
    expect(fieldKind("model")).toBe("code-only");
    expect(fieldKind("allowed-tools")).toBe("code-only");
    expect(fieldKind("whatever")).toBe("unknown");
    expect(fieldKind("license")).toBe("unknown"); // 위 표(14개)에 없으면 unknown (S-2077)
  });
});
