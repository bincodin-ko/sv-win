// S-950~S-954: 놓은 경로 → 노드. 읽기(prepare)는 비동기, 놓기(placeAll)는 한 번에 동기로 해서 되돌리기 1단계가 되게 한다
import type { BoardStore } from "../board/boards";
import { placeNew } from "../board/kinds/registry";
import { makeImage } from "../images/makeImage";
import { loadImage } from "../images/useImageSrc";
import { dirFiles, fileStat, fileText } from "../lib/ipc";
import { classify, type DropKind, type Head } from "./classify";
import { inRepo } from "./inRepo";
import { gridBases } from "./layout";
import { baseName, EXPLORER_MAX, makeCode, makeExplorer, makeMarkdown } from "./make";

export type Item = { kind: DropKind; path: string; isDir: boolean; text?: string; files?: string[]; nw?: number; nh?: number };
const extOf = (name: string) => { const i = name.lastIndexOf("."); return i > 0 ? name.slice(i + 1) : ""; };

/** 경로 하나를 읽어 종류를 정한다. 불필요한 읽기(이미지·repo 안 md)는 하지 않는다 */
export async function prepare(path: string, repo: string): Promise<Item> {
  const stat = await fileStat(path).catch(() => ({ exists: false, isDir: false, size: 0, mtime: 0 }));
  const ext = extOf(baseName(path));
  const inside = inRepo(path, repo);
  if (stat.isDir) {
    const files = await dirFiles(path, EXPLORER_MAX).catch(() => [] as string[]);
    return { kind: classify(stat, "binary", "", inside, files.length > 0), path, isDir: true, files };
  }
  const k0 = classify(stat, "binary", ext, inside); // 읽기 없이 정해지는 것: 이미지·repo 안 md·없는 파일
  if (k0 === "image") {
    const im = await loadImage(path).catch(() => null); // 못 읽어도 놓는다("Image missing")
    return { kind: "image", path, isDir: false, nw: im?.nw ?? 0, nh: im?.nh ?? 0 };
  }
  if (k0 === "markdown" || !stat.exists) return { kind: k0, path, isDir: false };
  const r = await fileText(path).catch(() => ({ kind: "error" as const }));
  const head: Head = r.kind;
  const kind = classify(stat, head, ext, inside);
  return { kind, path, isDir: false, text: r.kind === "text" ? r.text : undefined };
}

/** items 를 at 둘레 격자에 놓는다. 한 번의 놓기 = 되돌리기 1단계, 놓은 것들이 선택된다 */
export function placeAll(store: BoardStore, items: Item[], at: { x: number; y: number }): string[] {
  const bases = gridBases(at, items.length);
  const ids = items.map((it, i) => {
    const b = bases[i]!;
    switch (it.kind) {
      case "image": return makeImage(store, { path: it.path }, it.nw ?? 0, it.nh ?? 0, b);
      case "code": return placeNew(store, "code", makeCode(it.path, it.text ?? ""), b);
      case "markdown": return placeNew(store, "markdown", makeMarkdown(it.path), b);
      case "explorer": return placeNew(store, "explorer", makeExplorer(it.path, it.files ?? []), b);
      default: return placeNew(store, "file", { path: it.path, isDir: it.isDir }, b);
    }
  });
  // 항목마다 commit 이 하나씩 쌓였다 → 첫 것(놓기 전 상태)만 남긴다
  if (ids.length > 1) store.setState((s) => ({ history: { ...s.history, past: s.history.past.slice(0, s.history.past.length - (ids.length - 1)) } }));
  store.getState().select(ids);
  return ids;
}
