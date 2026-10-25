// S-2202: 처음 쓰려 할 때 한 번 묻고(Download / Not now) 받는다. 실행 파일을 받는 것이라 묻지 않고 시작하지 않는다
import { t } from "../i18n";
import { confirmDialog } from "../ui/ConfirmDialog";
import { currentModel, refreshVoice, startAndWait, waitReady, type Model } from "./status";
import { sizeLabel } from "./pins";

let declined = false; // 같은 세션에 다시 묻지 않음(설정 창에서는 retry() 로 직접 시작)
export const resetEnsureSession = () => {
  declined = false;
};

/** 준비됐으면 true. 없으면 확인창 → 받기 → 끝나면 true. Not now·실패면 false */
export async function ensureReady(model: Model = currentModel()): Promise<boolean> {
  const r = await refreshVoice(model);
  if (r.kind === "ready") return true;
  if (r.kind === "downloading") return waitReady(model);
  if (r.kind === "failed" || declined) return false;
  const ok = await confirmDialog({
    title: t("Download speech recognition?"),
    message: t("About {size}, once. Your voice is transcribed on this PC and never sent anywhere.", { size: sizeLabel(model) }),
    confirmLabel: t("Download"),
    cancelLabel: t("Not now"),
  });
  if (!ok) {
    declined = true;
    return false;
  }
  return startAndWait(model);
}
