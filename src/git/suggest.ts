// S-1025: 커밋 제목 제안(순수, LLM 없음). 추가만 Add / 삭제만 Remove / 그 밖 Update, 3개 넘으면 "Update N files".
export function suggestSubject(files: { path: string; status: string }[]): string {
  if (!files.length) return "";
  if (files.length > 3) return `Update ${files.length} files`;
  const verb = files.every((f) => f.status === "A" || f.status === "?") ? "Add" : files.every((f) => f.status === "D") ? "Remove" : "Update";
  return `${verb} ${files.map((f) => f.path.split(/[\\/]/).pop()).join(", ")}`;
}
