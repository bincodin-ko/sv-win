// S-883: paste 이벤트에서 이미지 파일 고르기. 순수 함수
type FileLike = { type: string };
export type ClipLike<T extends FileLike> = {
  files?: ArrayLike<T> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): T | null }> | null;
} | null | undefined;

const isImage = (t: string) => t.startsWith("image/");

/** 이미지(image/*) 파일 하나(여러 개면 첫째). 없으면 null */
export function pickImageFile<T extends FileLike>(d: ClipLike<T>): T | null {
  const f = Array.from(d?.files ?? []).find((x) => isImage(x.type));
  if (f) return f;
  for (const it of Array.from(d?.items ?? [])) {
    const file = it.kind === "file" && isImage(it.type) ? it.getAsFile() : null;
    if (file) return file;
  }
  return null;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/bmp": "bmp" };
/** 붙여넣은 이미지의 저장 이름 힌트: shot-YYYYMMDD-HHMMSS.<png|jpg|gif|webp|bmp> (로컬 시각) */
export function pasteFileName(mime: string, now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `shot-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.${EXT[mime] ?? "png"}`;
}
