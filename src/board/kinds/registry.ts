// S-800: 노드 종류 registry. 종류 파일이 registerKind 로 자기를 등록한다.
import type { ComponentType } from "react";
import type { BoardStore } from "../boards";
import { findSpot } from "../placement";
import { newId } from "../store";

export type KindSlot = "ring" | "more" | "insertTodo" | "rail";
export type SlotItem = { label: string; order: number };
export type KindDef = {
  id: string;
  label: string;
  Component: ComponentType<{ id: string }>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  /** 선택하면 8핸들(S-808) */
  resizable: boolean;
  /** true = 핸들은 좌우(e·w)만, 높이는 종류가 알아서(텍스트 상자, S-848) */
  widthOnly?: boolean;
  /** 크기 조절이 비율 고정(이미지, S-890) */
  keepRatio?: boolean;
  /** true = 본문 어디나 끌림, false = 머리줄(data-node-handle)만(S-809) */
  bodyDrag: boolean;
  /** 지우개 대상(S-868) */
  eraserTarget: boolean;
  /** 모양 위에서만 클릭이 닿는다: 노드 상자는 pointer-events 를 끄고 종류가 자기 모양에만 켠다(ink, S-864) */
  hitShape?: boolean;
  /** 대상(wireTo)이 지워지면 같이 지워진다(S-812) */
  deleteWithTarget?: boolean;
  /** 선 색(S-811) */
  wireColor?: "cyan" | "violet" | "orange";
  /** 새 노드의 종류별 필드. placeNew 의 opts 를 받는다 */
  create?: (opts?: Record<string, unknown>) => Record<string, unknown>;
  /** 놓기 전에 할 일이 있는 종류(이미지: 파일 선택창, S-880). 있으면 placeNew 는 노드를 직접 놓지 않고 이것을 부른다 */
  place?: (store: BoardStore, at: { x: number; y: number }) => void;
  /** 놓는 곳: 우클릭 고리·More 목록·Insert to-do 팝오버(S-806·S-807). 없으면 그 자리에 안 그린다 */
  ring?: SlotItem;
  more?: SlotItem;
  insertTodo?: SlotItem;
  /** 우측 레일 Insert to-do 아래 "Insert <label>" 버튼 data-testid="rail-insert-<종류 id>"(S-1233) */
  rail?: SlotItem;
  /** 우클릭 노드 메뉴에 이 종류가 더하는 항목(노드 하나만 대상일 때) */
  nodeMenu?: (id: string, store: BoardStore) => { label: string; run: () => void }[];
};

const kinds = new Map<string, KindDef>();
export function registerKind(def: KindDef): void { kinds.set(def.id, def); }
export function getKind(id: string): KindDef | undefined { return kinds.get(id); }
/** slot 항목이 있는 종류를 slot.order 순으로 */
export function kindsWith(slot: KindSlot): KindDef[] {
  return [...kinds.values()].filter((k) => k[slot]).sort((a, b) => a[slot]!.order - b[slot]!.order);
}
/** registry 에 없는 종류 노드에 그리는 글(S-801): "Unsupported node: <kind>" */
export function unsupportedText(kind: string): string { return `Unsupported node: ${kind}`; }
/**
 * 새 노드를 놓고 선택한다. 되돌리기 1단계(S-804). at = 노드 왼쪽 위(월드 좌표), 없으면 보이는 화면 가운데에서 겹치지 않는 자리(findSpot).
 * 새 id 를 돌려준다. registry 에 없는 종류면 던진다
 */
export function placeNew(store: BoardStore, kind: string, opts?: Record<string, unknown>, at?: { x: number; y: number }): string {
  const def = kinds.get(kind);
  if (!def) throw new Error(`placeNew: unknown kind ${kind}`);
  const s = store.getState();
  const { w, h } = def.defaultSize;
  const list = Object.values(s.nodes);
  const v = s.viewport;
  const base = at ?? { x: -v.x / v.zoom - w / 2, y: -v.y / v.zoom - h / 2 };
  if (def.place) return def.place(store, at ?? base), "";
  const spot = findSpot(base, { w, h }, list);
  s.commit();
  const id = newId(kind, s.nodes);
  const z = list.reduce((m, n) => Math.max(m, n.z), 0) + 1;
  s.addNode({ ...def.create?.(opts), id, kind, ...spot, w, h, z });
  s.select([id]);
  return id;
}
/** 시험용: registry 를 비운다 */
export function resetKindsForTest(): void { kinds.clear(); }
