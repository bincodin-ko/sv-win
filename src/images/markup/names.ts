// S-888: 저장 이름 규칙 <원본 이름>-markup-<n>.png (이미 -markup-k 면 k+1). 겹치면 Rust 가 -2 를 붙인다
export function markupName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? "image";
  const stem = file.replace(/\.[^.]*$/, "") || "image";
  const m = /^(.*)-markup-(\d+)$/.exec(stem);
  return m ? `${m[1]}-markup-${Number(m[2]) + 1}.png` : `${stem}-markup-1.png`;
}
