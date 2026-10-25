// 5묶음 E1 S-1810: 저장 안 한 편집 등록소. 스튜디오(E4~E7)가 편집기마다 register 하고, 닫기·전환·종료가 confirmUnsaved 를 먼저 부른다.
export interface Unsaved {
  label: string;
  dirty: () => boolean;
  save: () => Promise<boolean | void> | boolean | void;
  discard: () => Promise<void> | void;
}
export type Answer = "save" | "discard" | "cancel";

const items = new Map<string, Unsaved>();
export const unsaved = {
  /** 돌려주는 함수로 뺀다 */
  register(key: string, u: Unsaved): () => void {
    items.set(key, u);
    return () => void (items.get(key) === u && items.delete(key));
  },
  dirtyLabels: (): string[] => [...items.values()].filter((u) => u.dirty()).map((u) => u.label),
  clear: (): void => items.clear(), // 시험용
};

// 화면 쪽(StudioHost)이 "Save your … changes?" 창을 이 함수로 단다. 시험은 가짜로 바꾼다.
let asker: (label: string) => Promise<Answer> = async () => "cancel";
export const setUnsavedAsker = (f: (label: string) => Promise<Answer>): void => void (asker = f);

/** true = 계속해도 된다(저장했거나 버렸거나 더러운 게 없음), false = 멈춘다(취소·저장 실패) */
export async function confirmUnsaved(): Promise<boolean> {
  for (const u of [...items.values()]) {
    if (!u.dirty()) continue;
    const a = await asker(u.label);
    if (a === "cancel") return false;
    if (a === "discard") await u.discard();
    else {
      let ok: boolean | void;
      try { ok = await u.save(); } catch { return false; }
      if (ok === false) return false;
    }
  }
  return true;
}
