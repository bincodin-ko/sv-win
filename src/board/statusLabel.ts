import { t } from "../i18n";
import type { Status } from "../console/status";

/** 콘솔 상태 pill 의 표시 글자(순수). 상태 값 자체는 영어로 저장·비교하고 그릴 때만 번역한다 */
export function statusLabel(s: Status): string {
  switch (s) {
    case "IDLE": return t("IDLE");
    case "STARTING": return t("STARTING");
    case "WORKING": return t("WORKING");
    case "RUNNING": return t("RUNNING");
    case "DONE": return t("DONE");
    case "ERROR": return t("ERROR");
    case "PAUSED": return t("PAUSED");
    case "NEEDS YOU": return t("NEEDS YOU");
    case "READY": return t("READY");
  }
}
