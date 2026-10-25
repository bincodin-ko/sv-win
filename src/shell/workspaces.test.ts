import { describe, expect, it } from "vitest";
import ko from "../i18n/ko";
import { canCloseWorkspace, findWorkspace, nextHubName, nextWorkspaceName, normalizeName } from "./workspaces";

// 기대값 출처: spec S-335(안 쓴 가장 작은 수, 최대 24자), S-337(하나뿐이면 닫기 없음), 설명서(번호/이름 찾기)
describe("nextWorkspaceName S-335", () => {
  it("비면 Workspace 1", () => expect(nextWorkspaceName([])).toBe("Workspace 1"));
  it("안 쓴 가장 작은 수", () => {
    expect(nextWorkspaceName(["Workspace 1", "Workspace 3"])).toBe("Workspace 2");
    expect(nextWorkspaceName(["Workspace 2"])).toBe("Workspace 1");
    expect(nextWorkspaceName(["Workspace 1", "Workspace 2"])).toBe("Workspace 3");
  });
  it("이름을 바꾼 탭은 번호를 차지하지 않는다", () => expect(nextWorkspaceName(["Foo", "Workspace 1"])).toBe("Workspace 2"));
});

describe("normalizeName S-335", () => {
  it("24자로 자른다", () => expect(normalizeName("a".repeat(30))).toBe("a".repeat(24)));
  it("앞뒤 공백을 지운다", () => expect(normalizeName("  Dev  ")).toBe("Dev"));
  it("비면 빈 글(저장 안 함)", () => expect(normalizeName("   ")).toBe(""));
});

describe("canCloseWorkspace S-337", () => {
  it("하나뿐이면 거절", () => expect(canCloseWorkspace(1)).toBe(false));
  it("둘 이상이면 허용", () => expect(canCloseWorkspace(2)).toBe(true));
});

describe("findWorkspace S-344", () => {
  const l = [{ id: "a", name: "Workspace 1" }, { id: "b", name: "Backend" }, { id: "c", name: "Docs" }];
  it("번호는 탭 순서(1부터)", () => expect(findWorkspace(l, "2")?.id).toBe("b"));
  it("이름은 대소문자 무시 정확히", () => expect(findWorkspace(l, "docs")?.id).toBe("c"));
  it("정확한 이름이 없으면 앞부분", () => expect(findWorkspace(l, "back")?.id).toBe("b"));
  it("없으면 null", () => {
    expect(findWorkspace(l, "9")).toBeNull();
    expect(findWorkspace(l, "zzz")).toBeNull();
  });
});

// H5 S-2870: Hub 이름 'Hub N'(안 쓰인 가장 작은 수)
describe("nextHubName S-2870", () => {
  it("비면 Hub 1", () => expect(nextHubName([])).toBe("Hub 1"));
  it("안 쓴 가장 작은 수", () => {
    expect(nextHubName(["Hub 1", "Hub 3"])).toBe("Hub 2");
    expect(nextHubName(["Hub 1", "Hub 2"])).toBe("Hub 3");
  });
  it("다른 이름은 번호를 차지하지 않는다", () => expect(nextHubName(["Foo", "Workspace 1"])).toBe("Hub 1"));
});

// H5 S-2880: 새 문구는 ko 사전에
describe("Hub 문구 ko S-2880", () => {
  it("New Hub board·Hubs", () => {
    expect(ko["New Hub board"]).toBe("새 Hub 보드");
    expect(ko["Hubs"]).toBe("Hub 보드");
  });
});
