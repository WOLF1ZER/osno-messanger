import { useCallback, useEffect, useRef, useState } from "react";
import { FiMic, FiSquare, FiTrash2, FiPlay, FiPause, FiArrowUp } from "react-icons/fi";
import Modal from "../ui/Modal";
import RecorderRing from "./RecorderRing";
import { formatDuration } from "../../lib/format";

const MAX_SECONDS = 300; // voice messages up to 5 minutes
const BARS = 24;

/** Voice-message recorder: round record button in a progress ring, live sound bars, playback, retake, send. */
const AudioRecorder = ({ open, onClose, onSend, autoStart = false }) => {
  const [state, setState] = useState("idle"); // idle | recording | recorded
  const [elapsed, setElapsed] = useState(0); // seconds (fractional while recording)
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [levels, setLevels] = useState(() => Array(BARS).fill(0.08));
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);
  const startedAt = useRef(0);
  const audioRef = useRef(null);
  const sentRef = useRef(false);
  const urlRef = useRef(null);
  const startingRef = useRef(false);

  const releaseMic = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    releaseMic();
    audioRef.current?.pause();
    if (urlRef.current && !sentRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    sentRef.current = false;
    setState("idle");
    setElapsed(0);
    setBlob(null);
    setUrl(null);
    setPlaying(false);
    setLevels(Array(BARS).fill(0.08));
    setError("");
  }, []);

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();

  const start = useCallback(async () => {
    if (streamRef.current || startingRef.current) return;
    startingRef.current = true;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const b = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const u = URL.createObjectURL(b);
        urlRef.current = u;
        setBlob(b);
        setUrl(u);
        setElapsed((Date.now() - startedAt.current) / 1000);
        setState("recorded");
        releaseMic();
      };

      // live sound bars (optional) + timer
      let analyser = null;
      let data = null;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        try {
          const ctx = new AC();
          audioCtxRef.current = ctx;
          ctx.resume?.().catch(() => {});
          analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          ctx.createMediaStreamSource(stream).connect(analyser);
          data = new Uint8Array(analyser.frequencyBinCount);
        } catch {
          analyser = null;
        }
      }
      const tick = () => {
        if (analyser) {
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
          setLevels((prev) => [...prev.slice(1), Math.max(0.08, Math.min(1, peak * 2.2))]);
        }
        const secs = (Date.now() - startedAt.current) / 1000;
        setElapsed(secs);
        if (secs >= MAX_SECONDS) stop();
        else rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      startedAt.current = Date.now();
      rec.start();
      setState("recording");
      navigator.vibrate?.(15);
    } catch (err) {
      console.error(err);
      releaseMic();
      setError(err.name === "NotAllowedError" ? "Microphone access was denied." : "Couldn't start the microphone.");
    } finally {
      startingRef.current = false;
    }
  }, []);

  // reset when closed; start right away when opened with press-and-hold
  useEffect(() => {
    if (!open) reset();
    else if (autoStart) start();
  }, [open, autoStart, reset, start]);
  useEffect(() => () => releaseMic(), []);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  };

  const send = () => {
    if (!blob) return;
    sentRef.current = true; // the chat bubble keeps using this URL
    onSend({ blob, url, duration: Math.round(elapsed) });
    onClose();
  };

  const recording = state === "recording";

  return (
    <Modal open={open} onClose={onClose} title="Voice message" className="max-w-sm">
      <div className="flex flex-col items-center gap-5">
        <RecorderRing progress={elapsed / MAX_SECONDS} size={176} active={recording}>
          <button
            onClick={recording ? stop : state === "recorded" ? togglePlay : start}
            aria-label={recording ? "Stop recording" : state === "recorded" ? (playing ? "Pause" : "Play") : "Start recording"}
            className={`relative w-32 h-32 rounded-full grid place-items-center transition-all duration-300 active:scale-95 ${
              recording ? "bg-white text-black" : "bg-white/[0.06] border border-white/20 text-white hover:bg-white/10"
            }`}
          >
            {recording && <span className="absolute inset-0 rounded-full border-2 border-white/60 animate-ring" />}
            {recording ? <FiSquare size={30} fill="currentColor" /> : state === "recorded" ? (playing ? <FiPause size={34} /> : <FiPlay size={34} className="ml-1" />) : <FiMic size={36} />}
          </button>
        </RecorderRing>

        {/* live sound bars / static wave after recording */}
        <div className="flex items-center justify-center gap-[3px] h-10 w-full max-w-[260px]" aria-hidden="true">
          {levels.map((l, i) => (
            <span
              key={i}
              className={`flex-1 rounded-full transition-[height] duration-100 ${recording ? "bg-white" : "bg-white/40"}`}
              style={{ height: `${Math.round(l * 100)}%` }}
            />
          ))}
        </div>

        <div className="text-center">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-wider text-white">{formatDuration(elapsed)}</p>
          <p className="eyebrow mt-2">
            {state === "idle" && "Tap the mic to record"}
            {recording && "Recording… tap to stop"}
            {state === "recorded" && "Listen, retake or send"}
          </p>
          {error && <p className="text-sm text-ink-200 mt-3 border border-white/20 px-3 py-2">{error}</p>}
        </div>

        {state === "recorded" && (
          <audio ref={audioRef} src={url ?? undefined} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
        )}

        <div className="grid grid-cols-2 gap-3 w-full">
          <button onClick={state === "recorded" ? reset : onClose} className="btn-ghost w-full">
            {state === "recorded" ? (<><FiTrash2 size={15} /> Retake</>) : "Cancel"}
          </button>
          <button onClick={recording ? stop : send} disabled={!recording && !blob} className="btn-solid w-full">
            {recording ? (<><FiSquare size={13} /> Stop</>) : (<><FiArrowUp size={15} /> Send</>)}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default AudioRecorder;
