import { useEffect, useRef, useState } from "react";
import { FiVolume2 } from "react-icons/fi";
import { formatDuration } from "../../lib/format";

// Only one video circle plays with sound at a time.
let currentlyLoud = null;

const SIZE = 220;

/**
 * Round video message. Plays silently on a loop (like a GIF) while on screen; tap to watch
 * from the start with sound (a ring shows progress), tap again to go back to silent loop.
 */
const VideoNoteMessage = ({ src, duration, pending }) => {
  const ref = useRef(null);
  const [loud, setLoud] = useState(false);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);

  // only autoplay while visible (saves battery & data)
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) v.play().catch(() => {});
      else {
        v.pause();
        if (!v.muted) {
          v.muted = true;
          setLoud(false);
        }
      }
    }, { threshold: 0.4 });
    io.observe(v);
    return () => io.disconnect();
  }, [src]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const quiet = () => setLoud(false);
    v.addEventListener("osno-quiet", quiet);
    return () => {
      v.removeEventListener("osno-quiet", quiet);
      if (currentlyLoud === v) currentlyLoud = null;
    };
  }, [src]);

  const toggle = (e) => {
    e.stopPropagation();
    const v = ref.current;
    if (!v || !src) return;
    if (loud) {
      v.muted = true;
      v.loop = true;
      setLoud(false);
      return;
    }
    if (currentlyLoud && currentlyLoud !== v) {
      currentlyLoud.muted = true;
      currentlyLoud.loop = true;
      currentlyLoud.dispatchEvent(new Event("osno-quiet"));
    }
    currentlyLoud = v;
    v.currentTime = 0;
    v.muted = false;
    v.loop = false;
    v.play().catch(() => {});
    setLoud(true);
  };

  const r = SIZE / 2 - 3;
  const c = 2 * Math.PI * r;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={loud ? "Mute video message" : "Play video message with sound"}
      className="relative block rounded-full overflow-hidden bg-white/[0.06] border border-white/10"
      style={{ width: SIZE, height: SIZE, maxWidth: "62vw", maxHeight: "62vw" }}
    >
      {src ? (
        <video
          ref={ref}
          src={src}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          disablePictureInPicture
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            setTime(v.currentTime);
            setProgress(v.duration && Number.isFinite(v.duration) ? v.currentTime / v.duration : v.currentTime / (duration || 10));
          }}
          onEnded={(e) => {
            // finished with sound -> back to the silent loop
            const v = e.currentTarget;
            v.muted = true;
            v.loop = true;
            v.play().catch(() => {});
            setLoud(false);
          }}
          className={`w-full h-full object-cover pointer-events-none ${pending ? "opacity-60" : ""}`}
        />
      ) : (
        <span className="absolute inset-0 animate-pulse" />
      )}

      {loud && (
        <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} />
        </svg>
      )}

      <span className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-[11px] font-semibold tabular-nums text-white pointer-events-none">
        {!loud && <FiVolume2 size={11} className="opacity-70" />}
        {formatDuration(loud ? time : duration ?? 0)}
      </span>
    </button>
  );
};

export default VideoNoteMessage;
