// S-1064·S-1065: 명령줄로 노드 놓기. 보이는 화면 가운데·겹치지 않는 자리는 registry 의 placeNew 가 한다.
import "../board/kinds"; // 종류 등록
import type { BoardStore } from "../board/boards";
import { placeNew } from "../board/kinds/registry";

export type AddWhat = "note" | "kanban" | "calendar" | "checklist" | "browser";
const KIND: Record<AddWhat, string> = { note: "sticky", kanban: "kanban", calendar: "calendar", checklist: "checklist", browser: "web" };

/** text = 스티커 글 / 웹 주소. 새 id 를 돌려준다 */
export function addNode(store: BoardStore, what: AddWhat, text?: string): string {
  return placeNew(store, KIND[what], what === "browser" ? { url: text } : { text });
}
