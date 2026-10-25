// S-2262: 최근 24개 소리 크기를 막대로(왼쪽이 오래된 것)
export default function Waveform({ level }: { level: number[] }) {
  const bars = Array.from({ length: 24 }, (_, i) => level[level.length - 24 + i] ?? 0);
  return (
    <span data-testid="listen-wave" aria-hidden style={{ display: "flex", alignItems: "center", gap: 2, height: 24, flex: 1 }}>
      {bars.map((v, i) => <i key={i} style={{ width: 3, height: 3 + Math.min(1, v * 4) * 19, borderRadius: 2, background: "var(--voice-wave)" }} />)}
    </span>
  );
}
