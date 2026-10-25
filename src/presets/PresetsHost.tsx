import { useUi } from "../ui/useUi";
import { activeStore } from "./actions";
import Library from "./Library";

// useUi.presetsOpen 이 켜져 있으면 라이브러리를 그린다 (Tools · 우측 레일 · 빈 보드 · 홈 · 명령 `open presets` 가 같은 패널)
export default function PresetsHost() {
  const open = useUi((s) => s.presetsOpen);
  return open ? <Library store={activeStore()} onClose={() => useUi.setState({ presetsOpen: false })} /> : null;
}
