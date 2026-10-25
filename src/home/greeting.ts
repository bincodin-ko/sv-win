import { t } from "../i18n";
// S-311: 시간대 인사. 5~11시 morning, 12~17시 afternoon, 그 밖(18~4시) evening. 이름이 없으면 이름 없이.
export function greeting(now: Date, name?: string): string {
  const h = now.getHours();
  const part = h >= 5 && h < 12 ? "morning" : h >= 12 && h < 18 ? "afternoon" : "evening";
  const n = name?.trim();
  const g = part === "morning" ? t("Good morning") : part === "afternoon" ? t("Good afternoon") : t("Good evening");
  return n ? t("{greeting}, {name}", { greeting: g, name: n }) : g;
}
