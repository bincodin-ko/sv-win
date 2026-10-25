// S-2230: 마이크 장치 목록·권한
import { t } from "../i18n";
import { micError } from "./micError";

export type MicResult = "granted" | "denied" | "none";
export type MicState = "granted" | "denied" | "prompt" | "unknown";
export type MicInput = { id: string; label: string };

/** 입력 장치. 이름이 비면 "Microphone N"(권한 전에는 이름이 비어 있다). "Automatic" 은 deviceId 비움 = 호출 쪽 몫 */
export async function listInputs(): Promise<MicInput[]> {
  try {
    const ds = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications");
    return ds.map((d, i) => ({ id: d.deviceId, label: d.label || t("Microphone {n}", { n: i + 1 }) }));
  } catch {
    return [];
  }
}
/** 권한을 한 번 물어 본다. 잡은 스트림은 곧 닫는다 */
export async function requestMic(): Promise<MicResult> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    return micError(e).kind === "denied" ? "denied" : "none";
  }
}
/** 묻지 않고 확인(Permissions API). 안 되면 unknown */
export async function micState(): Promise<MicState> {
  try {
    const s = (await navigator.permissions.query({ name: "microphone" as PermissionName })).state;
    return s === "granted" || s === "denied" || s === "prompt" ? s : "unknown";
  } catch {
    return "unknown";
  }
}
