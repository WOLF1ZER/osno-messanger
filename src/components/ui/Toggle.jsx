const Toggle = ({ checked, onChange, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-7 rounded-full border transition-colors duration-300 ${
      checked ? "bg-white border-white" : "bg-white/5 border-white/20"
    }`}
  >
    <span
      className={`absolute top-1 left-1 w-5 h-5 rounded-full transition-all duration-300 ${
        checked ? "translate-x-5 bg-black" : "translate-x-0 bg-ink-300"
      }`}
    />
  </button>
);

export default Toggle;
