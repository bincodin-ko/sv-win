// S-364·S-365: 보드 한 글자 키. 키 버튼을 누르면 t("Press a new key"), 새 키 = 바꿈, Esc = 유지, Delete = 기본값
import { useEffect, useState } from "react";
import { ACTION_LABEL, keyFor, rebind, type Action, type Keymap } from "../../board/keymap";
import { DICT_KEYS, DICT_NAME, dictKey } from "../../voice/dictate";
import { useSettings } from "../useSettings";
import { keyFromEvent } from "../keyFromEvent";
import { useT } from "../../i18n";
import { FIXED_KEYS } from "../fixedKeys";

const ROWS = Object.keys(ACTION_LABEL) as Action[];
const MODS = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

export default function Shortcuts() {
  const t = useT();
  const km = useSettings((s) => s.s.keymap) as Keymap | undefined;
  const dict = useSettings((s) => s.s.dictateKey);
  const holdSpace = useSettings((s) => s.s.holdSpace);
  const [capturing, setCapturing] = useState<Action | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      if (MODS.includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation(); // Esc 가 설정 창을 닫지 않게
      const key = keyFromEvent(e); // 한글 입력기여도 event.code 로 (S-2412)
      const mod = e.ctrlKey ? "Ctrl+" : e.altKey ? "Alt+" : e.metaKey ? "Meta+" : e.shiftKey && !/^[a-z]$/i.test(key) ? "Shift+" : "";
      const r = rebind(km ?? {}, capturing, mod + key);
      if (r.ok) {
        useSettings.getState().patch({ keymap: r.map });
        setError("");
      } else {
        const name = mod ? t("That key") : key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
        setError(r.reason.kind === "reserved" ? t("X can't be changed") : r.reason.kind === "conflict" ? t("{key} is already used by {with}", { key: name, with: t(r.reason.with ?? "") }) : t("{key} is reserved and can't be used", { key: name }));
      }
      setCapturing(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, km, t]);

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
      {ROWS.map((a) => (
        <div key={a} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{t(ACTION_LABEL[a])}</span>
          <button data-testid={`shortcut-${a}`} onClick={() => { setError(""); setCapturing(a); }} style={{ minWidth: 120 }}>
            {capturing === a ? "Press a new key" : keyFor(km, a).toUpperCase()}
          </button>
        </div>
      ))}
      {/* F3 S-2292: 바꿀 수 없는 음성 줄(Space 는 이미 fixed) */}
      {holdSpace !== false && <FixedRow id="space" keys={t("Hold {key}", { key: "Space" })} what={t("Talk to the command bar")} />}
      <FixedRow id="dict" keys={t("Hold {key}", { key: DICT_NAME[dictKey(dict)] ?? DICT_KEYS[0]! })} what={t("Dictate into the focused console or field")} />
      <span style={{ color: "var(--mute)", fontSize: 12 }}>{t("Esc keeps the old key. Delete restores the default.")}</span>
      <div data-testid="fixed-keys" style={{ display: "grid", gap: 4, marginTop: 8 }}>
        <span style={{ fontWeight: 600 }}>{t("Fixed keys")}</span>
        {FIXED_KEYS.map((k) => (
          <div key={k.keys} style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text-dim)" }}>
            <span>{k.keys}</span><span>{t(k.what)}</span>
          </div>
        ))}
      </div>
      {error && <span data-testid="shortcut-error" role="alert" style={{ color: "var(--err-text)" }}>{error}</span>}
    </div>
  );
}

function FixedRow({ id, keys, what }: { id: string; keys: string; what: string }) {
  return (
    <div data-testid={`shortcut-fixed-${id}`} style={{ display: "flex", justifyContent: "space-between", color: "var(--text-dim)" }}>
      <span>{keys} — {what}</span>
    </div>
  );
}
