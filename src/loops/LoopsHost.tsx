// D9: useUi.loops.open 이 켜지면 오른쪽 Loops 패널을 그린다 (L 키 · Tools › Loops · 우측 레일이 같은 상태를 켠다)
import { useUi } from "../ui/useUi";
import LoopsPanel from "./LoopsPanel";

export default function LoopsHost() {
  return useUi((s) => s.loops.open) ? <LoopsPanel /> : null;
}
