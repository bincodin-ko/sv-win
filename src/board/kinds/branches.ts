// S-1050: 브랜치 카드 노드 종류. 고리 More › Git branches. 저장 필드는 kind 뿐(내용은 살아 있는 git 상태).
import BranchesCard from "../../git/BranchesCard";
import { registerKind } from "./registry";
import { tm } from "../../i18n";

registerKind({
  id: "branches",
  label: tm("Git branches"),
  Component: BranchesCard,
  defaultSize: { w: 300, h: 360 }, // 추측(S-1050)
  minSize: { w: 240, h: 200 }, // 추측(S-1056)
  resizable: true,
  bodyDrag: false, // 머리줄만 끌린다
  eraserTarget: true,
  more: { label: tm("Git branches"), order: 40 },
});
