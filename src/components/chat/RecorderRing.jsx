/** Round progress ring (0..1) drawn around its children — used by the voice and video-circle recorders. */
const RecorderRing = ({ progress = 0, size = 220, stroke = 4, active = false, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="white"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          style={{ transition: active ? "stroke-dashoffset 120ms linear" : "stroke-dashoffset 300ms ease" }}
        />
      </svg>
      {children}
    </div>
  );
};

export default RecorderRing;
