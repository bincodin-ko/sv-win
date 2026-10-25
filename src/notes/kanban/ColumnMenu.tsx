// 열 ⋯ 메뉴 항목 (S-933). 문서 순서: Rename, Add card, Color, Sort by priority, Move…, Clear done cards, Delete column
import { NOTE_COLORS } from "../colors";
import type { Entry } from "./PopMenu";
import { moveDirs, type Column, type MoveDir } from "./kanban";
import { t, tm } from "../../i18n";

const MOVE: [MoveDir, string][] = [["left", tm("Move left")], ["right", tm("Move right")], ["start", tm("Move to start")], ["end", tm("Move to end")]];

export type ColumnActions = {
  rename: () => void; addCard: () => void; color: (id: string) => void; sort: () => void;
  move: (d: MoveDir) => void; clearDone: () => void; remove: () => void;
};

export function columnEntries(cols: Column[], c: Column, a: ColumnActions): Entry[] {
  const dirs = moveDirs(cols, c.id);
  return [
    { label: t("Rename"), run: a.rename },
    { label: t("Add card"), run: a.addCard },
    { label: t("Color"), extra: "›", sub: NOTE_COLORS.map((k) => ({ label: t(k), extra: c.color?.toLowerCase() === k.toLowerCase() ? "✓" : undefined, run: () => a.color(k.toLowerCase()) })) },
    ...(c.cards.length >= 2 ? [{ label: t("Sort by priority"), run: a.sort }] : []),
    ...MOVE.filter(([d]) => dirs.includes(d)).map(([d, label]) => ({ label: t(label), run: () => a.move(d) })),
    ...(c.cards.some((k) => k.done) ? [{ label: t("Clear done cards"), run: a.clearDone }] : []),
    { label: t("Delete column"), run: a.remove },
  ];
}
