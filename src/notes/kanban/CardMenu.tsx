// 카드 메뉴 항목 (S-939): Mark as done, Edit, Duplicate, Move to ›, Delete card
import type { Entry } from "./PopMenu";
import { columnLabel, type Card, type Column } from "./kanban";
import { t } from "../../i18n";

export type CardActions = { toggle: () => void; edit: () => void; duplicate: () => void; moveTo: (colId: string) => void; remove: () => void };

export function cardEntries(cols: Column[], card: Card, a: CardActions): Entry[] {
  const home = cols.find((c) => c.cards.some((k) => k.id === card.id));
  return [
    { label: card.done ? t("Mark as not done") : t("Mark as done"), run: a.toggle },
    { label: t("Edit"), run: a.edit },
    { label: t("Duplicate"), run: a.duplicate },
    { label: t("Move to"), extra: "›", sub: cols.filter((c) => c !== home).map((c) => ({ label: columnLabel(c.name), run: () => a.moveTo(c.id) })) },
    { label: t("Delete card"), run: a.remove },
  ];
}
