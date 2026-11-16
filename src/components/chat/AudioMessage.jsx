import { useEffect, useMemo, useRef, useState } from "react";
import { FaPlay, FaPause } from "react-icons/fa";
import { formatDuration } from "../../lib/format";

// Only one voice message plays at a time across the whole app.
let currentlyPlaying = null;

const BAR_COUNT = 28;

/** Deterministic pseudo-waveform so each message has its own stable shape. */
const useWave = (seed) =>
  useMemo(() => {
    let h = 0;
    for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return Array.from({ length: BAR_COUNT }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return 0.25 + ((h >>> 16) % 1000) / 1333;
    });
  }, [seed]);

const AudioMessage = ({ id, src, duration: knownDuration, mine }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(knownDuration ?? 0);
  const [elapsed, setElapsed] = useState(0);
  const wave = useWave(id);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
      if (currentlyPlaying === audio) currentlyPlaying = null;
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (playing) {
      audio.pause();
      return;
    }
    if (currentlyPlaying && currentlyPlaying !== audio) currentlyPlaying.pause();
    currentlyPlaying = audio;
    try {
      await audio.play();
    } catch (err) {
      console.error("Could not play audio", err);
    }
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const fg = mine ? "bg-black" : "bg-white";
  const bgBar = mine ? "bg-black/25" : "bg-white/25";

  return (
    <div className="flex items-center gap-3 min-w-[220px] py-1">
      <button
        onClick={toggle}
        aria-label={playing ? "Pause" : "Play"}
        className={`w-10 h-10 shrink-0 rounded-full grid place-items-center transition-transform active:scale-95 ${
          mine ? "bg-black text-white" : "bg-white text-black"
        }`}
      >
        {playing ? <FaPause size={12} /> : <FaPlay size={12} className="ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="flex items-center gap-[3px] h-8 cursor-pointer" onClick={seek}>
          {wave.map((h, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors ${i / BAR_COUNT < progress ? fg : bgBar}`}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <span className={`text-[11px] tabular-nums ${mine ? "text-black/60" : "text-ink-300"}`}>
          {formatDuration(playing || elapsed ? elapsed : duration)}
        </span>
      </div>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          setElapsed(a.currentTime);
          if (Number.isFinite(a.duration) && a.duration > 0) setProgress(a.currentTime / a.duration);
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
          setElapsed(0);
        }}
      />
    </div>
  );
};

export default AudioMessage;
