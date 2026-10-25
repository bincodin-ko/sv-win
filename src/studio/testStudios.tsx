// 시험 전용(주소에 ?studioTest, Tauri 밖에서만): 가짜 스튜디오 하나(id "fake"). 실제 스튜디오(E4~E7)와 id 가 겹치지 않는다. 열기: window.__openFakeStudio().
// 글상자에 쓰면 저장 안 한 편집으로 등록된다. 저장하면 window.__fakeStudioSaves 에 쌓이고, window.__fakeStudioFail 이 켜져 있으면 저장이 실패한다.
import { useEffect, useRef, useState } from "react";
import StudioFrame from "./StudioFrame";
import { registerStudio, type StudioId } from "./registry";
import { unsaved } from "./unsaved";
import { closeStudioRequest, requestOpenStudio, studioTitle } from "./useStudio";

type W = { __fakeStudioSaves?: string[]; __fakeStudioFail?: boolean };
const TITLES: Record<StudioId, string> = { code: "Code", markdown: "Markdown", documents: "Documents", skills: "Skills", fake: "Fake" };

function Fake({ id, arg }: { id: StudioId; arg?: string }) {
  const [v, setV] = useState("");
  const cur = useRef(v);
  const saved = useRef("");
  cur.current = v;
  useEffect(() => unsaved.register(`fake-${id}`, {
    label: "code",
    dirty: () => cur.current !== saved.current,
    save: () => {
      const w = window as unknown as W;
      if (w.__fakeStudioFail) return false;
      (w.__fakeStudioSaves ??= []).push(cur.current);
      saved.current = cur.current;
    },
    discard: () => void (saved.current = cur.current),
  }), [id]);
  return (
    <StudioFrame title={studioTitle(TITLES[id])} left={<div style={{ padding: 12 }}>list</div>} onClose={closeStudioRequest}>
      <div data-testid="fake-studio-arg">{arg}</div>
      <textarea data-testid="fake-studio-editor" value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1 }} />
    </StudioFrame>
  );
}

export function registerTestStudios(): void {
  registerStudio({ id: "fake", title: "Fake", order: 99, Component: (p) => <Fake id="fake" arg={p.arg} /> });
  (window as unknown as { __openFakeStudio: () => Promise<string | null> }).__openFakeStudio = () => requestOpenStudio("fake");
}
