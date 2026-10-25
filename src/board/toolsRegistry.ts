// S-803: 좌측 레일 도구·놓기 도구 표. 내장 Select·Spawn agent·Fit to content 는 처음부터 들어 있다.
import type { ComponentType } from "react";
import type { Action } from "./keymap";
import type { BoardStore } from "./boards";
import { tm } from "../i18n";

export type ToolDef = {
  id: string; // 레일 버튼 data-testid = rail-<id>
  label: string;
  /** 레일 버튼 글자(없으면 라벨 첫 글자) */
  icon?: string;
  order: number;
  key?: Action;
  flyout?: ComponentType<{ onClose: () => void }>;
  /** 놓기 도구: 빈 캔버스를 한 번 누르면 호출, 그 뒤 도구는 Select 로(S-804). at = 월드 좌표 */
  onPlace?: (store: BoardStore, at: { x: number; y: number }) => void;
  /** 도구가 켜진 동안 보드 위에 얹는 층. 있는 동안 보드의 선택·끌기·고리 메뉴는 쉰다(S-868 자리) */
  layer?: ComponentType;
};

const builtin = (): ToolDef[] => [{ id: "select", label: tm("Select"), icon: "↖", order: 10, key: "select" }, { id: "spawn", label: tm("Spawn agent"), icon: "+", order: 20, key: "spawn" }, { id: "fit", label: tm("Fit to content"), icon: "⤢", order: 100 }];
let list: ToolDef[] = builtin();
export function registerTool(def: ToolDef): void { list = [...list.filter((t) => t.id !== def.id), def]; }
/** order 순 */
export function tools(): ToolDef[] { return [...list].sort((a, b) => a.order - b.order); }
/** 시험용: 내장 셋만 남기고 비운다 */
export function resetToolsForTest(): void { list = builtin(); }
