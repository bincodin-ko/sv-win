// 5묶음 E5 S-1928·S-1929·S-1931·S-1932: 자동 저장·초안·상태 글자(순수, 전역 setTimeout 이라 가짜 시계로 시험).
export type StatusText = "" | "Saving…" | "Saved" | "Could not save" | "Recovered unsaved edits" | "Found a change on disk";
export const SAVE_DELAY = 1500; // docs_markdown "a second and a half after you stop typing"
export const DRAFT_DELAY = 300;
export type SaverOpts = {
  /** ok = 저장됨, changed = 디스크가 달라져 거절됨, fail = 못 씀 */
  save: () => Promise<"ok" | "changed" | "fail">;
  draft: () => void;
  clearDraft: () => void;
  onStatus: (s: StatusText) => void;
};
export interface Saver {
  /** 글이 바뀔 때마다 */
  edit(): void;
  /** Ctrl+S: 바로 저장 */
  saveNow(): Promise<void>;
  /** 열 때 초안을 되살렸다 → 상태를 띄우고 자동 저장이 이어서 쓴다 */
  recovered(): void;
  found(): void;
  dirty(): boolean;
  /** 저장 중이면 끝날 때까지(최대 3초) */
  settled(): Promise<void>;
  dispose(): void;
}

export function createSaver(o: SaverOpts): Saver {
  let dirty = false, ver = 0;
  let saveT: ReturnType<typeof setTimeout> | undefined, draftT: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | null = null;
  const arm = () => { clearTimeout(saveT); saveT = setTimeout(() => void run(), SAVE_DELAY); };
  async function run(): Promise<void> {
    clearTimeout(saveT);
    if (inflight) await inflight;
    if (!dirty) return;
    const mine = ver;
    o.onStatus("Saving…");
    const p = (async () => {
      let r: "ok" | "changed" | "fail";
      try { r = await o.save(); } catch { r = "fail"; }
      if (r === "ok") {
        if (mine !== ver) return; // 저장하는 사이 또 쳤다: 다음 저장이 이어서 쓴다
        dirty = false;
        clearTimeout(draftT);
        o.clearDraft();
        o.onStatus("Saved");
      } else if (r === "changed") o.onStatus("Found a change on disk");
      else { clearTimeout(draftT); o.draft(); o.onStatus("Could not save"); } // 초안은 남긴다
    })();
    inflight = p.finally(() => { if (inflight === q) inflight = null; });
    const q = inflight;
    return p;
  }
  return {
    edit() {
      dirty = true; ver++;
      arm();
      clearTimeout(draftT);
      draftT = setTimeout(o.draft, DRAFT_DELAY);
    },
    async saveNow() { clearTimeout(saveT); if (dirty) await run(); },
    recovered() { dirty = true; ver++; o.onStatus("Recovered unsaved edits"); arm(); },
    found: () => o.onStatus("Found a change on disk"),
    dirty: () => dirty,
    settled: () => (inflight ? Promise.race([inflight, new Promise<void>((r) => setTimeout(r, 3000))]) : Promise.resolve()),
    dispose() { clearTimeout(saveT); clearTimeout(draftT); },
  };
}
