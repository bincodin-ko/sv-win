// F3: 음성 키 구독 한 곳(Hold Space·받아쓰기 키·Esc·창 블러) + 앱 시작 연결(읽기 watchReplies·orb speaking). AppShell 이 한 번 둔다
import { useEffect } from "react";
import { boardHasKeyboard, overlayOpen } from "../board/keys";
import { useSettings } from "../settings/useSettings";
import { useUi } from "../ui/useUi";
import { dictKey, isDictKey } from "./dictate";
import { escTaken } from "./keys";
import { cancelVoice, hasCtx, ptt, setCtx } from "./listen";
import DictationPill from "./DictationPill";
import { onSpeaking, watchReplies } from "./speak";
import { spaceOk } from "./ptt";
import { refreshVoice, useVoice } from "./status";

export default function VoiceHost({ ctx }: { ctx: { wsId: string; repo: string } | null }) {
  const wsId = ctx?.wsId, repo = ctx?.repo;
  useEffect(() => { setCtx(wsId && repo ? { wsId, repo } : null); }, [wsId, repo]);
  useEffect(() => {
    void refreshVoice().catch(() => {});
    const offReplies = watchReplies();
    const offSpeaking = onSpeaking((speaking) => useVoice.setState({ speaking }));
    const down = (e: KeyboardEvent) => {
      const st = useSettings.getState().s;
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) { // S-2273 ① 음성이 먼저
        if (cancelVoice()) { escTaken.add(e); e.preventDefault(); e.stopImmediatePropagation(); }
        return;
      }
      if (isDictKey(e, st.dictateKey)) { // 떼기 전까지 Ctrl+Space 는 셸·입력란으로 안 간다(S-2721)
        if (dictKey(st.dictateKey) === "CtrlSpace") { e.preventDefault(); e.stopPropagation(); }
        return void (!e.repeat && ptt.down("dict"));
      }
      if (e.code.startsWith("Control") && dictKey(st.dictateKey) === "CtrlSpace") return; // Ctrl 은 받아쓰기 조합의 일부(다른 키가 아님)
      ptt.other(); // 받아쓰기 키 말고 다른 키: 단축키로 쓴 것이면 받아쓰기를 시작하지 않는다
      if (spaceOk({ code: e.code, repeat: e.repeat, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, shift: e.shiftKey, boardShown: hasCtx(), hasKeyboard: boardHasKeyboard(e.target), overlay: overlayOpen(), studio: !!useUi.getState().studio.open, holdSpace: st.holdSpace !== false })) ptt.down("space");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && ptt.active === "space") e.preventDefault(); // 듣고 있던 Space 가 버튼을 누르지 않게
      const dk = dictKey(useSettings.getState().s.dictateKey);
      if (e.code === "Space") { ptt.up("space"); if (dk === "CtrlSpace") ptt.up("dict"); } // 각자 자기 것일 때만 끝난다
      else if (e.code === dk || (dk === "CtrlSpace" && e.code.startsWith("Control"))) ptt.up("dict"); // Ctrl 을 먼저 놓아도 끝
    };
    const blur = () => ptt.blur();
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      offReplies(); offSpeaking();
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return <DictationPill />;
}
