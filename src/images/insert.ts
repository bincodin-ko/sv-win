// S-880·S-883: 이미지 넣는 길 둘 — 파일 선택창, 붙여넣기(paste 이벤트)
import { useEffect, type RefObject } from "react";
import type { BoardStore } from "../board/boards";
import { boardHasKeyboard, overlayOpen } from "../board/keys";
import { imageSave, pickFile } from "../lib/ipc";
import { makeImage } from "./makeImage";
import { pasteFileName, pickImageFile } from "./paste";
import { loadImage } from "./useImageSrc";
import { t } from "../i18n";

const filters = () => [{ name: t("Images"), extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }]; // 호출 때 번역

/** 선택창을 열고 고른 파일을 at 에 놓는다. 취소하면 아무것도 안 한다 */
export async function pickAndPlace(store: BoardStore, at: { x: number; y: number }): Promise<void> {
  const path = await pickFile(filters());
  if (!path) return;
  const im = await loadImage(path).catch(() => null); // 못 읽어도 놓는다("Image missing")
  makeImage(store, { path }, im?.nw ?? 0, im?.nh ?? 0, at);
}

/** 붙여넣은 그림을 Screenshots 폴더에 저장하고 보이는 화면 가운데에 놓는다 */
export async function pasteImage(store: BoardStore, file: File): Promise<void> {
  const shot = await imageSave(new Uint8Array(await file.arrayBuffer()), pasteFileName(file.type, new Date()));
  const im = await loadImage(shot).catch(() => null);
  makeImage(store, { shot }, im?.nw ?? 0, im?.nh ?? 0);
}

/**
 * Ctrl+V: paste 이벤트에 이미지가 있으면 이미지 노드, 없으면 기존 노드 붙여넣기(S-026).
 * 키 입력 뒤 paste 이벤트가 안 오는 환경이면 같은 틱 끝에 기존 붙여넣기로 대신한다.
 */
export function usePasteImage(store: BoardStore, visibleRef: RefObject<boolean>): void {
  useEffect(() => {
    let handled = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mine = (t: EventTarget | null) => !!visibleRef.current && boardHasKeyboard(t) && !overlayOpen();
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.key.toLowerCase() !== "v" || !mine(e.target)) return;
      handled = false;
      timer = setTimeout(() => { if (!handled) { handled = true; store.getState().paste(); } }, 0);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!mine(e.target)) return;
      handled = true;
      clearTimeout(timer);
      const f = pickImageFile(e.clipboardData);
      if (f) { e.preventDefault(); void pasteImage(store, f); } else store.getState().paste();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("paste", onPaste); clearTimeout(timer); };
  }, [store, visibleRef]);
}
