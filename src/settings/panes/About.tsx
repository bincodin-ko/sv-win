// S-382: 버전과 플랫폼만(업데이트 확인·릴리스 노트는 만들지 않는다)
import { useT } from "../../i18n";
export const APP_VERSION = "0.1.0"; // package.json version 과 맞춘다
export default function About() {
  const t = useT();
  return (
    <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", margin: 0 }}>
      <dt style={{ color: "var(--text-dim)" }}>{t("Version")}</dt><dd style={{ margin: 0 }}>{APP_VERSION}</dd>
      <dt style={{ color: "var(--text-dim)" }}>{t("Platform")}</dt><dd style={{ margin: 0 }}>Windows</dd>
    </dl>
  );
}
