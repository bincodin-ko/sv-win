import { t, tm } from "../i18n";
// S-2212: getUserMedia 오류 → 종류와 안내 문구
export type MicErrorKind = "denied" | "none" | "busy" | "other";
const MSG: Record<string, [MicErrorKind, string]> = {
  NotAllowedError: ["denied", tm("Microphone blocked. Allow Symvibe in Windows Settings › Privacy & security › Microphone.")],
  NotFoundError: ["none", tm("No microphone found.")],
  NotReadableError: ["busy", tm("The microphone is in use by another app.")],
};
export function micError(err: unknown): { kind: MicErrorKind; message: string } {
  const name = (err as { name?: string } | null)?.name ?? "";
  const m = MSG[name];
  return m ? { kind: m[0], message: t(m[1]) } : { kind: "other", message: t("Couldn't start the microphone.") };
}
