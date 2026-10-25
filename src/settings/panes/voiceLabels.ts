// S-2290 Recognition 상태 글자·버튼
import { t } from "../../i18n";
import type { Recog } from "../../voice/status";
export const recogLabel = (r: Recog): string =>
  r.kind === "ready" ? t("Ready") : r.kind === "downloading" ? t("Downloading {pct}%", { pct: r.pct ?? 0 }) : r.kind === "failed" ? t("Failed: {why}", { why: r.why ?? t("unknown") }) : t("Not downloaded");
export const recogButton = (r: Recog): "Download" | "Retry" | null => (r.kind === "none" ? "Download" : r.kind === "failed" ? "Retry" : null);
