// S-881·S-891: 이미지 노드를 놓는다. 선택창·붙여넣기·(C15)파일 드롭이 같이 부른다
import type { BoardStore } from "../board/boards";
import { findSpot } from "../board/placement";
import { newId } from "../board/store";
import { fitLongSide } from "./sizing";

export type ImageSrcRef = { path?: string; shot?: string };
/** src: 파일 경로(문자열) 또는 {path} / {shot=Screenshots 에 저장한 그림 경로}. at = 노드 왼쪽 위(월드), 없으면 보이는 화면 가운데. 새 id */
export function makeImage(store: BoardStore, src: string | ImageSrcRef, nw: number, nh: number, at?: { x: number; y: number }): string {
  const s = store.getState();
  const { w, h } = fitLongSide(nw, nh);
  const v = s.viewport;
  const spot = findSpot(at ?? { x: -v.x / v.zoom - w / 2, y: -v.y / v.zoom - h / 2 }, { w, h }, Object.values(s.nodes));
  s.commit();
  const id = newId("image", s.nodes);
  const z = Object.values(s.nodes).reduce((m, n) => Math.max(m, n.z), 0) + 1;
  s.addNode({ id, kind: "image", ...(typeof src === "string" ? { path: src } : src), nw, nh, ...spot, w, h, z });
  s.select([id]);
  return id;
}
