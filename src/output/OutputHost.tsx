// B15 S-667: useUi.outputViewer 가 열려 있으면 viewer 를 그린다 (main.tsx 에 한 줄)
import { useUi } from "../ui/useUi";
import { useShell } from "../shell/useShell";
import OutputViewer from "./OutputViewer";

export default function OutputHost() {
  const ov = useUi((s) => s.outputViewer);
  const active = useShell((s) => s.openRepos.find((r) => r.path === s.activeRepo)?.activeWs);
  const wsId = ov.wsId ?? active;
  const close = () => useUi.setState({ outputViewer: { open: false, nodeId: null } });
  return ov.open && ov.nodeId && wsId ? <OutputViewer key={`${wsId}/${ov.nodeId}`} wsId={wsId} nodeId={ov.nodeId} onClose={close} /> : null;
}
