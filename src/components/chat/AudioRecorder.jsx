import { useEffect, useRef, useState } from "react";
import { FiMic, FiSquare, FiTrash2, FiPlay, FiPause } from "react-icons/fi";
import Modal from "../ui/Modal";
import { formatDuration } from "../../lib/format";

/**
 * Voice-message recorder.
 * Fixes from the draft: `sendAudioMessage` was undefined, the mic stream was never released,
 * the blob was mislabelled as audio/wav, and the timer leaked on close.
 */
const AudioRecorder = ({ open, onClose, onSend }) => {
  const [state, setState] = useState("idle"); // idle | recording | recorded
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioRef = useRef(null);
  const sentRef = useRef(false);

  const releaseMic = () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const reset = () => {
    releaseMic();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    audioRef.current?.pause();
    if (url && !sentRef.current) URL.revokeObjectURL(url);
    sentRef.current = false;
    setState("idle");
    setSeconds(0);
    setBlob(null);
    setUrl(null);
    setPlaying(false);
    setError("");
  };

  // reset whenever the dialog closes; release mic on unmount
  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => releaseMic, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      recorderRef.current = rec;
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const b = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState("recorded");
        releaseMic();
      };
      rec.start();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error(err);
      setError("Microphone access was denied.");
    }
  };

  const stop = () => recorderRef.current?.state === "recording" && recorderRef.current.stop();

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  };

  const send = () => {
    if (!blob) return;
    sentRef.current = true; // keep the object URL alive for the chat bubble
    onSend({ blob, url, duration: seconds });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Voice message">
      <div className="flex flex-col items-center gap-6">
        <div className="relative w-28 h-28 grid place-items-center">
          {state === "recording" && (
            <>
              <span className="absolute inset-0 rounded-full border border-white/40 animate-ring" />
              <span className="absolute inset-0 rounded-full border border-white/40 animate-ring [animation-delay:1.2s]" />
            </>
          )}
          <button
            onClick={state === "recording" ? stop : start}
            aria-label={state === "recording" ? "Stop recording" : "Start recording"}
            className={`relative w-24 h-24 rounded-full grid place-items-center transition-all duration-300 ${
              state === "recording" ? "bg-white text-black scale-105" : "border-2 border-white text-white hover:bg-white hover:text-black"
            }`}
          >
            {state === "recording" ? <FiSquare size={26} fill="currentColor" /> : <FiMic size={30} />}
          </button>
        </div>

        <div className="text-center">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-wider text-white">{formatDuration(seconds)}</p>
          <p className="eyebrow mt-2">
            {state === "idle" && "Tap to record"}
            {state === "recording" && "Recording…"}
            {state === "recorded" && "Ready to send"}
          </p>
          {error && <p className="text-sm text-ink-200 mt-3 border border-white/20 px-3 py-2">{error}</p>}
        </div>

        {state === "recording" && (
          <div className="flex items-center gap-1 h-8">
            {Array.from({ length: 14 }).map((_, i) => (
              <span
                key={i}
                className="w-1 h-full bg-white/80 rounded-full animate-bar origin-center"
                style={{ animationDelay: `${(i % 7) * 0.12}s` }}
              />
            ))}
          </div>
        )}

        {state === "recorded" && (
          <div className="flex gap-3">
            <button onClick={togglePlay} className="icon-btn border border-white/20 w-12 h-12" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <FiPause size={18} /> : <FiPlay size={18} />}
            </button>
            <button onClick={reset} className="icon-btn border border-white/20 w-12 h-12" aria-label="Discard">
              <FiTrash2 size={18} />
            </button>
            <audio ref={audioRef} src={url ?? undefined} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
          </div>
        )}

        <button onClick={send} disabled={!blob} className="btn-solid w-full">
          Send
        </button>
      </div>
    </Modal>
  );
};

export default AudioRecorder;
