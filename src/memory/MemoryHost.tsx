// S-1360: Memory 모달 호스트. 열림은 useUi.memory (M 키·Tools·명령)
import { useUi } from "../ui/useUi";
import MemoryPanel from "./MemoryPanel";

export default function MemoryHost() {
  return useUi((s) => s.memory.open) ? <MemoryPanel /> : null;
}
