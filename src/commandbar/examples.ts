// S-2441: 입력란 힌트 예문 (화면 언어를 따른다. 해석은 K8)
import { getLang } from "../i18n";

export const hintExample = (): string => (getLang() === "ko" ? "클로드 두 개 띄워" : "pass this task to codex");
