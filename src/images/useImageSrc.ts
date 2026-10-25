// S-889: 파일 바이트(Rust file_read)를 Blob URL 로. 같은 경로는 한 번만 읽는다
import { useEffect, useState } from "react";
import { fileRead, shotPath } from "../lib/ipc";

export type Loaded = { url: string; nw: number; nh: number };
const cache = new Map<string, Promise<Loaded>>();
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };

export function loadImage(path: string): Promise<Loaded> {
  let p = cache.get(path);
  if (!p) {
    p = (async () => {
      const bytes = await fileRead(await shotPath(path)); // shot 은 파일 이름일 수 있다(S-883)
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "image/png" }));
      const im = new Image();
      im.src = url;
      await im.decode().catch(() => { throw new Error("그림이 아님"); });
      return { url, nw: im.naturalWidth, nh: im.naturalHeight };
    })();
    cache.set(path, p);
    p.catch(() => cache.delete(path)); // 실패는 기억하지 않는다(파일이 생기면 다시 읽음)
  }
  return p;
}

export type ImageSrc = { state: "loading" } | { state: "missing" } | ({ state: "ok" } & Loaded);
export function useImageSrc(path: string | undefined): ImageSrc {
  const [r, setR] = useState<{ path?: string; v: ImageSrc }>({ v: { state: "loading" } });
  useEffect(() => {
    if (!path) return setR({ path, v: { state: "missing" } });
    let live = true;
    loadImage(path).then((l) => live && setR({ path, v: { state: "ok", ...l } }), () => live && setR({ path, v: { state: "missing" } }));
    return () => { live = false; };
  }, [path]);
  return r.path === path ? r.v : { state: "loading" };
}
