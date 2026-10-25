import { ROLES, type Role } from "../commandbar/roles";
import { roleLabel } from "../board/roles";
import { useT } from "../i18n";

export default function RoleChips({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  useT();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {ROLES.map((r) => (
        <button key={r} data-testid="role-chip" data-role={r} data-active={r === role ? "true" : undefined} onClick={() => onChange(r)}
          style={{ padding: "3px 10px", border: "1px solid var(--bd)", borderRadius: 12, background: r === role ? "var(--accent)" : "none", color: r === role ? "var(--accent-ink)" : "var(--fg-2)", font: "12px system-ui", cursor: "pointer" }}>
          {roleLabel(r)}
        </button>
      ))}
    </div>
  );
}
