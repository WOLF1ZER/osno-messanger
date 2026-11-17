import { useCallback, useEffect, useRef, useState } from "react";
import { FiVideo, FiSquare, FiTrash2, FiArrowUp, FiRefreshCw, FiVolume2, FiVolumeX } from "react-icons/fi";
import Modal from "../ui/Modal";
import RecorderRing from "./RecorderRing";
import { formatDuration } from "../../lib/format";

const MAX_VIDEO_SECONDS = 10;
const SIZE = 248;

// Safari records MP4 only; Chrome / Firefox / Android record WebM (newer Chrome also MP4).
const pickMime = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const options = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return options.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? "";
};

/** Round video message ("video circle"): up to 10 seconds, front camera, preview, retake, send. */
const VideoNoteRecorder = ({ open, onClose, onSend, autoStart = false }) => {
  const [state, setState] = useState("idle"); // idle | preview | recording | recorded
  const [elapsed, setElapsed] = useState(0);
  const [facing, setFacing] = useState("user");
  const [blob, setBlob] = useState(null);
  const [url, setUrl] = useState(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");

  const liveRef = useRef(null);
  const playRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const rafRef = useRef(null);
  const startedAt = useRef(0);
  const urlRef = useRef(null);
  const sentRef = useRef(false);
  const wantRecordRef = useRef(false);

  const releaseCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (liveRef.current) liveRef.current.srcObject = null;
  };

  const reset = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    releaseCamera();
    if (urlRef.current && !sentRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    sentRef.current = false;
    wantRecordRef.current = false;
    setState("idle");
    setElapsed(0);
    setBlob(null);
    setUrl(null);
    setMuted(false);
    setError("");
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const record = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: 1_000_000, audioBitsPerSecond: 64_000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    recorderRef.current = rec;
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const secs = Math.min(MAX_VIDEO_SECONDS, (Date.now() - startedAt.current) / 1000);
      const b = new Blob(chunks, { type: (rec.mimeType || mimeType || "video/webm").split(";")[0] });
      const u = URL.createObjectURL(b);
      urlRef.current = u;
      setBlob(b);
      setUrl(u);
      setElapsed(secs);
      setState("recorded");
      releaseCamera();
    };
    startedAt.current = Date.now();
    rec.start(250);
    setState("recording");
    navigator.vibrate?.(15);
    const tick = () => {
      const secs = (Date.now() - startedAt.current) / 1000;
      setElapsed(Math.min(secs, MAX_VIDEO_SECONDS));
      if (secs >= MAX_VIDEO_SECONDS) stop(); // hard 10 s limit
      else rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [stop]);

  // open the camera (live round preview)
  const openCamera = useCallback(
    async (face) => {
      setError("");
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setError("Video recording isn't supported in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 480 }, height: { ideal: 480 }, aspectRatio: { ideal: 1 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          liveRef.current.play?.().catch(() => {});
        }
        setState((s) => (s === "recorded" ? s : "preview"));
        if (wantRecordRef.current) {
          wantRecordRef.current = false;
          record();
        }
      } catch (err) {
        console.error(err);
        setError(err.name === "NotAllowedError" ? "Camera access was denied." : "Couldn't start the camera.");
        setState("idle");
      }
    },
    [record]
  );

  // opened -> start the camera (and record right away after press-and-hold); closed -> clean up
  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    wantRecordRef.current = autoStart;
    openCamera("user");
    setFacing("user");
  }, [open, autoStart, reset, openCamera]);
  useEffect(() => () => releaseCamera(), []);

  // keep the <video> attached when it (re)mounts
  useEffect(() => {
    if (liveRef.current && streamRef.current && liveRef.current.srcObject !== streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
      liveRef.current.play?.().catch(() => {});
    }
  });

  const flip = () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    openCamera(next);
  };

  const retake = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setBlob(null);
    setUrl(null);
    setElapsed(0);
    setState("idle");
    openCamera(facing);
  };

  const send = () => {
    if (!blob) return;
    sentRef.current = true; // the chat bubble keeps using this URL
    onSend({ blob, url, duration: Math.max(1, Math.round(elapsed)) });
    onClose();
  };

  const recording = state === "recording";
  const recorded = state === "recorded";
  const inner = SIZE - 16;

  return (
    <Modal open={open} onClose={onClose} title="Video message" className="max-w-sm">
      <div className="flex flex-col items-center gap-5">
        <RecorderRing progress={elapsed / MAX_VIDEO_SECONDS} size={SIZE} stroke={5} active={recording}>
          <div
            className="relative rounded-full overflow-hidden bg-white/[0.04] border border-white/10"
            style={{ width: inner, height: inner }}
          >
            {recorded ? (
              <video
                ref={playRef}
                src={url ?? undefined}
                autoPlay
                loop
                playsInline
                muted={muted}
                onClick={() => setMuted((m) => !m)}
                className={`w-full h-full object-cover cursor-pointer ${facing === "user" ? "-scale-x-100" : ""}`}
              />
            ) : (
              <video
                ref={liveRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${facing === "user" ? "-scale-x-100" : ""} ${state === "idle" ? "opacity-0" : ""}`}
              />
            )}
            {state === "idle" && !error && (
              <div className="absolute inset-0 grid place-items-center text-ink-400">
                <FiVideo size={34} className="animate-pulse" />
              </div>
            )}
            {recording && (
              <span className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 text-[11px] font-semibold tracking-wider text-white">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> REC
              </span>
            )}
            {recorded && (
              <button
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute" : "Mute"}
                className="absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 grid place-items-center rounded-full bg-black/60 text-white"
              >
                {muted ? <FiVolumeX size={16} /> : <FiVolume2 size={16} />}
              </button>
            )}
          </div>
        </RecorderRing>

        <div className="text-center">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-wider text-white">
            {formatDuration(elapsed)}
            <span className="text-ink-400 text-xl"> / {formatDuration(MAX_VIDEO_SECONDS)}</span>
          </p>
          <p className="eyebrow mt-2">
            {state === "idle" && !error && "Starting camera…"}
            {state === "preview" && "Tap record · up to 10 seconds"}
            {recording && "Recording… tap to stop"}
            {recorded && "Watch, retake or send"}
          </p>
          {error && <p className="text-sm text-ink-200 mt-3 border border-white/20 px-3 py-2">{error}</p>}
        </div>

        {/* controls: flip · record/stop · (spacer) */}
        {!recorded && (
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={flip}
              disabled={recording || state === "idle"}
              aria-label="Switch camera"
              className="icon-btn w-11 h-11 border border-white/15 disabled:opacity-30"
            >
              <FiRefreshCw size={18} />
            </button>
            <button
              onClick={recording ? stop : record}
              disabled={state === "idle"}
              aria-label={recording ? "Stop recording" : "Start recording"}
              className="relative w-16 h-16 rounded-full grid place-items-center border-2 border-white transition-transform active:scale-95 disabled:opacity-30"
            >
              {recording ? (
                <span className="w-6 h-6 rounded-md bg-white" />
              ) : (
                <span className="w-12 h-12 rounded-full bg-white" />
              )}
            </button>
            <span className="w-11 h-11" aria-hidden="true" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 w-full">
          <button onClick={recorded ? retake : onClose} className="btn-ghost w-full">
            {recorded ? (<><FiTrash2 size={15} /> Retake</>) : "Cancel"}
          </button>
          <button onClick={recording ? stop : send} disabled={!recording && !blob} className="btn-solid w-full">
            {recording ? (<><FiSquare size={13} /> Stop</>) : (<><FiArrowUp size={15} /> Send</>)}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default VideoNoteRecorder;
