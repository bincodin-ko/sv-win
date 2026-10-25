// S-312: 천천히 도는 주황 구슬(CSS). 누르면 한 바퀴 더 돈다. 모양은 추측.
import { useState } from "react";
import { useT } from "../i18n";
import { useLowSpec } from "../perf/lowSpec";
import { orbPlay, useDocHidden } from "../perf/poll";

export default function Orb() {
  const t = useT();
  const [kicks, setKicks] = useState(0);
  const play = orbPlay(useDocHidden(), useLowSpec());
  return (
    <button
      data-testid="orb"
      aria-label={t("Orb")}
      onClick={() => setKicks((k) => k + 1)}
      style={{ all: "unset", cursor: "pointer", width: 72, height: 72, display: "block" }}
    >
      <style>{"@keyframes orb-spin{to{transform:rotate(360deg)}}"}</style>
      {/* 바깥은 누를 때마다 key 가 바뀌어 한 바퀴(0.9s)를 새로 돈다, 안쪽은 계속 천천히(24s) */}
      <span key={kicks} style={{ display: "block", width: "100%", height: "100%", animation: kicks ? "orb-spin .9s ease-in-out" : undefined }}>
        <span
          style={{
            display: "block", width: "100%", height: "100%", borderRadius: "50%", animation: play === "none" ? "none" : "orb-spin 24s linear infinite", animationPlayState: play === "paused" ? "paused" : "running",
            background: "radial-gradient(circle at 32% 28%, #ffd2a1 0%, var(--accent) 38%, #9a3412 100%)", // theme-fixed
            boxShadow: "0 0 36px color-mix(in srgb, var(--accent) 45%, transparent)",
          }}
        />
      </span>
    </button>
  );
}
