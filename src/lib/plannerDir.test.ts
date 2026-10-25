import { describe, expect, it } from "vitest";
import { plannerDir } from "./ipc";

describe("S-2968 plannerDir 가짜", () => {
  it("비Tauri는 C:\fake\PlannerBox", async () => {
    expect(await plannerDir()).toBe("C:\fake\PlannerBox");
  });
});
