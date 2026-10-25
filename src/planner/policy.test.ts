import { beforeEach, describe, expect, it } from "vitest";
import type { Intent, Target } from "../commandbar/intent";
import { setLang } from "../i18n";
import { policyOf, summarize } from "./policy";

beforeEach(() => setLang("en"));
const C = (id: string): Target => ({ kind: "console", id });
const names = (t: Target) => (t.kind === "console" ? ({ a: "Otto", b: "Max" } as Record<string, string>)[t.id] ?? t.id : t.kind);

describe("S-2950 policyOf", () => {
  const run: Intent[] = [
    { t: "spawn", n: 1 }, { t: "makeGroup", n: 2 }, { t: "addToGroup", n: 1, groupId: "g" }, { t: "pause", target: { kind: "all" } }, { t: "resume", target: { kind: "all" } },
    { t: "restart", target: C("a") }, { t: "close", target: C("a") }, { t: "camera", op: "fitAll" }, { t: "open", what: "settings" }, { t: "tidy" }, { t: "undo" }, { t: "redo" },
    { t: "theme", value: "light" }, { t: "workspace", op: "close", ref: "w" }, { t: "add", what: "note" }, { t: "openWeb", url: "http://localhost:1" }, { t: "tool", tool: "pen" },
    { t: "status" }, { t: "whoFinished" }, { t: "help" }, { t: "closePanel" }, { t: "loop", minutes: 5, text: "x" },
  ];
  it("나머지는 run", () => {
    for (const i of run) expect(policyOf(i), i.t).toBe("run");
  });
  it("tell·broadcast·git은 confirm", () => {
    for (const i of [{ t: "tell", targets: [C("a")], text: "x" }, { t: "broadcast", text: "x" }, { t: "git", op: "push" }] as Intent[]) expect(policyOf(i), i.t).toBe("confirm");
  });
});

describe("S-2952 summarize", () => {
  it("tell", () => expect(summarize({ t: "tell", targets: [C("a"), C("b")], text: "hello" }, names)).toBe('Tell Otto, Max: "hello"'));
  it("글은 앞 120자 + …", () => {
    expect(summarize({ t: "broadcast", text: "x".repeat(120) }, names)).toBe(`Send to every console: "${"x".repeat(120)}"`);
    expect(summarize({ t: "broadcast", text: "x".repeat(121) }, names)).toBe(`Send to every console: "${"x".repeat(120)}…"`);
  });
  it("git", () => {
    expect(summarize({ t: "git", op: "commitPush" }, names)).toBe("Git: commit and push");
    expect(summarize({ t: "git", op: "commit", message: "fix" }, names)).toBe('Git: commit with message "fix"');
    expect(summarize({ t: "git", op: "commit" }, names)).toBe("Git: commit");
    expect(summarize({ t: "git", op: "push" }, names)).toBe("Git: push");
    expect(summarize({ t: "git", op: "pull" }, names)).toBe("Git: pull");
  });
  it("그 밖은 비어 있지 않은 한 줄", () => expect(summarize({ t: "tidy" }, names)).toBeTruthy());
});
