import { describe, expect, it } from "vitest";
import {
  addCard, addColumn, clearDone, deleteCard, deleteColumn, dueFrom, dueLabel, duplicateCard, editCard, initialColumns,
  moveCard, moveColumn, moveColumnTo, moveDirs, NAME_MAX, renameColumn, setColumnColor, sortByPriority, toggleDone,
  type Column, type Priority,
} from "./kanban";

// 기대값은 spec/3묶음-2.md S-930~S-945 문장에서만 가져왔다.
const names = (c: Column[]) => c.map((x) => x.name);
const titles = (c: Column[], i: number) => c[i]!.cards.map((k) => k.title);
/** 열 index 0 에 제목·우선순위 카드들을 넣은 칸반 */
function withCards(list: [string, Priority][], col = 0): Column[] {
  let c = initialColumns();
  for (const [title, priority] of list) c = addCard(c, c[col]!.id, { title, priority });
  return c;
}
const cardId = (c: Column[], title: string) => c.flatMap((x) => x.cards).find((k) => k.title === title)!.id;

describe("S-930·S-945 처음 열", () => {
  it("열 4개: Backlog, To do, In progress, Done. 기본 색 없음/Sky/Amber/Sage, 카드 0장", () => {
    const c = initialColumns();
    expect(names(c)).toEqual(["Backlog", "To do", "In progress", "Done"]);
    expect(c.map((x) => x.color)).toEqual([null, "sky", "amber", "sage"]);
    expect(c.every((x) => x.cards.length === 0)).toBe(true);
    expect(new Set(c.map((x) => x.id)).size).toBe(4);
  });
});

describe("S-932 열 추가·이름", () => {
  it("+ Column: 맨 오른쪽에 더하고 이름은 24자까지, 빈 이름은 취소", () => {
    const c = addColumn(initialColumns(), "Review");
    expect(names(c)).toEqual(["Backlog", "To do", "In progress", "Done", "Review"]);
    expect(addColumn(c, "   ")).toEqual(c);
    const long = addColumn(initialColumns(), "x".repeat(40));
    expect(long[4]!.name).toBe("x".repeat(NAME_MAX));
    expect(NAME_MAX).toBe(24);
  });
  it("Rename: 앞뒤 공백 제거·24자, 빈 이름이면 그대로", () => {
    const c = initialColumns();
    expect(names(renameColumn(c, c[1]!.id, "  Next  "))[1]).toBe("Next");
    expect(renameColumn(c, c[1]!.id, "")).toEqual(c);
    expect(renameColumn(c, c[1]!.id, "y".repeat(30))[1]!.name).toHaveLength(24);
  });
  it("열 색: 고르면 그 색, null 이면 없음", () => {
    const c = initialColumns();
    expect(setColumnColor(c, c[0]!.id, "rose")[0]!.color).toBe("rose");
    expect(setColumnColor(c, c[1]!.id, null)[1]!.color).toBeNull();
  });
});

describe("S-933·S-935 열 이동 4방향 경계", () => {
  const c = initialColumns();
  it("가능한 방향만: 맨 왼쪽은 right/end, 가운데는 넷 다, 맨 오른쪽은 left/start", () => {
    expect(moveDirs(c, c[0]!.id).sort()).toEqual(["end", "right"]);
    expect(moveDirs(c, c[1]!.id).sort()).toEqual(["end", "left", "right", "start"]);
    expect(moveDirs(c, c[3]!.id).sort()).toEqual(["left", "start"]);
    expect(moveDirs([c[0]!], c[0]!.id)).toEqual([]);
  });
  it("Move left/right/start/end", () => {
    expect(names(moveColumn(c, c[2]!.id, "left"))).toEqual(["Backlog", "In progress", "To do", "Done"]);
    expect(names(moveColumn(c, c[1]!.id, "right"))).toEqual(["Backlog", "In progress", "To do", "Done"]);
    expect(names(moveColumn(c, c[3]!.id, "start"))).toEqual(["Done", "Backlog", "To do", "In progress"]);
    expect(names(moveColumn(c, c[0]!.id, "end"))).toEqual(["To do", "In progress", "Done", "Backlog"]);
  });
  it("경계에서는 그대로", () => {
    expect(moveColumn(c, c[0]!.id, "left")).toEqual(c);
    expect(moveColumn(c, c[3]!.id, "right")).toEqual(c);
    expect(moveColumn(c, c[0]!.id, "start")).toEqual(c);
    expect(moveColumn(c, c[3]!.id, "end")).toEqual(c);
  });
  it("끌어 놓기 moveColumnTo(slot) 결과 = 메뉴 Move 와 같다", () => {
    expect(names(moveColumnTo(c, c[0]!.id, 4))).toEqual(names(moveColumn(c, c[0]!.id, "end")));
    expect(names(moveColumnTo(c, c[3]!.id, 0))).toEqual(names(moveColumn(c, c[3]!.id, "start")));
    expect(names(moveColumnTo(c, c[2]!.id, 1))).toEqual(names(moveColumn(c, c[2]!.id, "left")));
    expect(names(moveColumnTo(c, c[1]!.id, 3))).toEqual(names(moveColumn(c, c[1]!.id, "right")));
    expect(moveColumnTo(c, c[1]!.id, 1)).toEqual(c); // 제자리
    expect(moveColumnTo(c, c[1]!.id, 2)).toEqual(c); // 제자리(바로 뒤)
  });
});

describe("S-934 Delete column", () => {
  it("열이 카드와 함께 사라지고, 마지막 열도 지울 수 있다", () => {
    let c = withCards([["a", "none"], ["b", "none"]]);
    c = deleteColumn(c, c[0]!.id);
    expect(names(c)).toEqual(["To do", "In progress", "Done"]);
    expect(c.flatMap((x) => x.cards)).toHaveLength(0);
    for (const col of [...c]) c = deleteColumn(c, col.id);
    expect(c).toEqual([]);
    expect(addColumn(c, "Fresh")).toHaveLength(1); // 빈 칸반에서도 다시 시작
  });
});

describe("S-936·S-938 카드 추가·편집", () => {
  it("addCard: 열 맨 아래에 제목·노트·날짜·우선순위(기본 None)로, done 아님", () => {
    let c = initialColumns();
    c = addCard(c, c[1]!.id, { title: "  Research  " });
    c = addCard(c, c[1]!.id, { title: "Second", notes: "n", due: "2026-09-12", priority: "high" });
    expect(titles(c, 1)).toEqual(["Research", "Second"]);
    expect(c[1]!.cards[0]).toMatchObject({ notes: "", due: null, priority: "none", done: false });
    expect(c[1]!.cards[1]).toMatchObject({ notes: "n", due: "2026-09-12", priority: "high", done: false });
    expect(new Set(c.flatMap((x) => x.cards).map((k) => k.id)).size).toBe(2);
  });
  it("제목이 비면 카드를 만들지 않는다", () => {
    const c = initialColumns();
    expect(addCard(c, c[0]!.id, { title: "   " })).toEqual(c);
  });
  it("editCard: 바꾼 필드만, 제목을 비우면 거절", () => {
    const c = withCards([["a", "low"]]);
    const id = cardId(c, "a");
    expect(editCard(c, id, { title: "A2", priority: "high" })[0]!.cards[0]).toMatchObject({ title: "A2", priority: "high", id });
    expect(editCard(c, id, { title: " " })).toEqual(c);
  });
});

describe("S-939 카드 메뉴 동작", () => {
  it("Mark as done 은 열을 옮기지 않고 done 만 켜고 끈다", () => {
    const c = withCards([["a", "none"]]);
    const on = toggleDone(c, cardId(c, "a"));
    expect(on[0]!.cards[0]!.done).toBe(true);
    expect(titles(on, 0)).toEqual(["a"]);
    expect(toggleDone(on, cardId(on, "a"))[0]!.cards[0]!.done).toBe(false);
  });
  it("Duplicate: 같은 열 원본 바로 아래, 같은 내용, 새 id", () => {
    const c = withCards([["a", "med"], ["b", "none"]]);
    const d = duplicateCard(c, cardId(c, "a"));
    expect(titles(d, 0)).toEqual(["a", "a", "b"]);
    expect(d[0]!.cards[1]).toMatchObject({ title: "a", priority: "med" });
    expect(d[0]!.cards[1]!.id).not.toBe(d[0]!.cards[0]!.id);
  });
  it("Delete card", () => {
    const c = withCards([["a", "none"], ["b", "none"]]);
    expect(titles(deleteCard(c, cardId(c, "a")), 0)).toEqual(["b"]);
  });
  it("Move to: 다른 열 맨 아래", () => {
    const c = withCards([["a", "none"]]);
    const m = moveCard(c, cardId(c, "a"), c[3]!.id, 0);
    expect(titles(m, 0)).toEqual([]);
    expect(titles(m, 3)).toEqual(["a"]);
  });
});

describe("S-940 카드 끌어 놓기 위치", () => {
  const c = withCards([["A", "none"], ["B", "none"], ["C", "none"]]);
  const A = cardId(c, "A"), C = cardId(c, "C");
  const col = c[0]!.id;
  it("같은 열: slot 은 놓기 전 목록 기준(뒤로 가면 자기 자리 하나 빠짐)", () => {
    expect(titles(moveCard(c, A, col, 3), 0)).toEqual(["B", "C", "A"]);
    expect(titles(moveCard(c, C, col, 0), 0)).toEqual(["C", "A", "B"]);
    expect(titles(moveCard(c, A, col, 1), 0)).toEqual(["A", "B", "C"]);
    expect(titles(moveCard(c, A, col, 0), 0)).toEqual(["A", "B", "C"]);
    expect(titles(moveCard(c, A, col, 2), 0)).toEqual(["B", "A", "C"]);
  });
  it("다른 열: 그 자리에 끼운다", () => {
    let d = moveCard(c, A, c[1]!.id, 0);
    d = moveCard(d, C, c[1]!.id, 1);
    d = moveCard(d, cardId(d, "B"), c[1]!.id, 1);
    expect(titles(d, 0)).toEqual([]);
    expect(titles(d, 1)).toEqual(["A", "B", "C"]);
  });
  it("없는 열·없는 카드는 그대로", () => {
    expect(moveCard(c, A, "nope", 0)).toEqual(c);
    expect(moveCard(c, "nope", col, 0)).toEqual(c);
  });
});

describe("S-941 Sort by priority", () => {
  it("High > Med > Low > None, 같은 우선순위끼리는 원래 순서(안정)", () => {
    const c = withCards([["n1", "none"], ["l1", "low"], ["h1", "high"], ["m1", "med"], ["h2", "high"], ["n2", "none"], ["l2", "low"], ["m2", "med"]]);
    expect(titles(sortByPriority(c, c[0]!.id), 0)).toEqual(["h1", "h2", "m1", "m2", "l1", "l2", "n1", "n2"]);
  });
  it("다른 열은 안 건드리고, 입력을 바꾸지 않는다", () => {
    const c = withCards([["l", "low"], ["h", "high"]]);
    const before = JSON.stringify(c);
    const s = sortByPriority(c, c[0]!.id);
    expect(JSON.stringify(c)).toBe(before);
    expect(s[1]).toBe(c[1]);
  });
});

describe("S-942 Clear done cards", () => {
  it("그 열의 done 카드만 지운다", () => {
    let c = withCards([["a", "none"], ["b", "none"], ["c", "none"]]);
    c = toggleDone(toggleDone(c, cardId(c, "a")), cardId(c, "c"));
    const other = moveCard(c, cardId(c, "b"), c[1]!.id, 0);
    c = clearDone(other, c[0]!.id);
    expect(titles(c, 0)).toEqual([]);
    expect(titles(c, 1)).toEqual(["b"]);
    let e = withCards([["x", "none"], ["y", "none"]]);
    e = clearDone(toggleDone(e, cardId(e, "x")), e[0]!.id);
    expect(titles(e, 0)).toEqual(["y"]);
  });
});

describe("S-937 dueFrom", () => {
  const now = new Date(2026, 8, 10, 15, 30); // 2026-09-10 오후
  it("Today/Tomorrow/Next week(+7일)/직접", () => {
    expect(dueFrom("today", now)).toBe("2026-09-10");
    expect(dueFrom("tomorrow", now)).toBe("2026-09-11");
    expect(dueFrom("nextweek", now)).toBe("2026-09-17");
    expect(dueFrom("2026-12-25", now)).toBe("2026-12-25");
  });
  it("달·해가 넘어가도 맞다", () => {
    expect(dueFrom("tomorrow", new Date(2026, 8, 30))).toBe("2026-10-01");
    expect(dueFrom("nextweek", new Date(2026, 11, 28))).toBe("2027-01-04");
  });
});

describe("S-937 dueLabel", () => {
  const now = new Date(2026, 8, 10, 23, 59);
  it("오늘 Today · 내일 Tomorrow · 그 밖 'Sep 12'", () => {
    expect(dueLabel("2026-09-10", now)).toEqual({ text: "Today", overdue: false });
    expect(dueLabel("2026-09-11", now)).toEqual({ text: "Tomorrow", overdue: false });
    expect(dueLabel("2026-09-12", now)).toEqual({ text: "Sep 12", overdue: false });
    expect(dueLabel("2027-01-05", now)).toEqual({ text: "Jan 5", overdue: false });
  });
  it("지난 날짜는 같은 형식 + overdue(붉은 글씨)", () => {
    expect(dueLabel("2026-09-09", now)).toEqual({ text: "Sep 9", overdue: true });
    expect(dueLabel("2026-01-31", now)).toEqual({ text: "Jan 31", overdue: true });
  });
});
