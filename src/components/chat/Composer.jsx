import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiPaperclip, FiSmile, FiMic, FiArrowUp, FiCornerUpLeft, FiX, FiVideo } from "react-icons/fi";
import { messagePreview } from "../../lib/format";

// The emoji picker is large; load it only when first opened.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

const MODE_KEY = "osno:record-mode";
const HINT_KEY = "osno:record-hint";
const HOLD_MS = 300;

const readStore = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
};

/**
 * Message box. The round button on the right sends text; with an empty box it is the
 * recorder: tap switches voice <-> video circle, press and hold records in the current mode.
 * onRecord(mode, { autoStart }) with mode "audio" | "video".
 */
const Composer = ({ onSendText, onAttach, onRecord, disabled, replyTo, onCancelReply }) => {
  const [text, setText] = useState("");
  const [mode, setMode] = useState(() => (readStore(MODE_KEY, "audio") === "video" ? "video" : "audio"));
  const [hint, setHint] = useState("");
  const holdTimer = useRef(null);
  const held = useRef(false);
  const hintTimer = useRef(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const inputRef = useRef(null);
  const emojiRef = useRef(null);

  // close emoji picker on outside click / Escape
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e) => emojiRef.current && !emojiRef.current.contains(e.target) && setEmojiOpen(false);
    const onKey = (e) => e.key === "Escape" && setEmojiOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  // replying: put the cursor in the box; Esc cancels the reply
  useEffect(() => {
    if (!replyTo) return;
    inputRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onCancelReply?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replyTo, onCancelReply]);

  // auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSendText(value);
    setText("");
    setEmojiOpen(false);
    inputRef.current?.focus();
  };

  const hasText = text.trim().length > 0;

  const flashHint = (msg) => {
    clearTimeout(hintTimer.current);
    setHint(msg);
    hintTimer.current = setTimeout(() => setHint(""), 1800);
  };
  useEffect(() => () => {
    clearTimeout(hintTimer.current);
    clearTimeout(holdTimer.current);
  }, []);

  // recorder button: hold = record, tap = switch voice / video circle
  const onPressStart = (e) => {
    if (hasText || disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
    held.current = false;
    clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => {
      held.current = true;
      navigator.vibrate?.(20);
      onRecord?.(mode, { autoStart: true });
    }, HOLD_MS);
  };
  const onPressEnd = () => clearTimeout(holdTimer.current);
  const onButtonClick = () => {
    if (hasText) return send();
    if (held.current) {
      held.current = false; // the hold already opened the recorder
      return;
    }
    const next = mode === "audio" ? "video" : "audio";
    setMode(next);
    writeStore(MODE_KEY, next);
    navigator.vibrate?.(8);
    const shown = Number(readStore(HINT_KEY, "0")) || 0;
    if (shown < 3) {
      writeStore(HINT_KEY, String(shown + 1));
      flashHint(next === "video" ? "Video circle · hold to record" : "Voice · hold to record");
    } else {
      flashHint(next === "video" ? "Video circle" : "Voice message");
    }
  };
  // keyboard users: Enter / Space on the button switches; Alt+Enter records
  const onButtonKey = (e) => {
    if (!hasText && e.key === "Enter" && e.altKey) {
      e.preventDefault();
      onRecord?.(mode, { autoStart: true });
    }
  };

  return (
    <div className="shrink-0 px-3 sm:px-5 pt-3 pb-safe border-t border-white/10 bg-black/60 backdrop-blur-xl">
      {replyTo && (
        <div className="flex items-center gap-3 mb-2 pl-3 pr-1 py-1.5 rounded-2xl bg-white/[0.05] border-l-2 border-white animate-fade-up">
          <FiCornerUpLeft size={16} className="text-ink-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white truncate">Reply to {replyTo.name}</p>
            <p className="text-[13px] text-ink-400 truncate">{messagePreview(replyTo.preview)}</p>
          </div>
          <button onClick={onCancelReply} className="icon-btn w-8 h-8 shrink-0" aria-label="Cancel reply">
            <FiX size={16} />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="relative flex-1 min-w-0 flex items-end glass rounded-3xl pl-2 pr-1.5 transition-colors focus-within:border-white/30">
          <div ref={emojiRef} className="relative self-end pb-1">
            <button
              type="button"
              onClick={() => setEmojiOpen((v) => !v)}
              className={`icon-btn ${emojiOpen ? "text-white bg-white/10" : ""}`}
              aria-label="Emoji"
              disabled={disabled}
            >
              <FiSmile size={20} />
            </button>
            {emojiOpen && (
              <div className="absolute bottom-full left-0 mb-3 z-40 shadow-2xl animate-fade-up">
                <Suspense fallback={<div className="glass-strong w-[300px] h-[380px] grid place-items-center eyebrow">Loading…</div>}>
                  <EmojiPicker
                    theme="dark"
                    width={300}
                    height={380}
                    lazyLoadEmojis
                    previewConfig={{ showPreview: false }}
                    skinTonesDisabled
                    onEmojiClick={(e) => {
                      setText((t) => t + e.emoji);
                      inputRef.current?.focus();
                    }}
                  />
                </Suspense>
              </div>
            )}
          </div>

          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={disabled ? "You can't message this user" : "Write a message…"}
            className="flex-1 min-w-0 w-full resize-none bg-transparent outline-none text-[15px] text-white placeholder:text-ink-400 py-3 px-1 max-h-[140px] leading-6 disabled:cursor-not-allowed"
          />

          <div className="flex items-center self-end pb-1">
            <button type="button" onClick={onAttach} className="icon-btn" aria-label="Attach file" disabled={disabled}>
              <FiPaperclip size={19} />
            </button>
          </div>
        </div>

        <div className="relative shrink-0">
          {hint && !hasText && (
            <span className="absolute bottom-full right-0 mb-2 whitespace-nowrap px-3 py-1.5 rounded-full glass-strong text-[12px] font-semibold tracking-wide text-white animate-fade-up pointer-events-none">
              {hint}
            </span>
          )}
          <button
            type="button"
            onClick={onButtonClick}
            onPointerDown={onPressStart}
            onPointerUp={onPressEnd}
            onPointerLeave={onPressEnd}
            onPointerCancel={onPressEnd}
            onKeyDown={onButtonKey}
            onContextMenu={(e) => !hasText && e.preventDefault()}
            disabled={disabled}
            aria-label={
              hasText
                ? "Send message"
                : mode === "video"
                  ? "Video circle — tap to switch to voice, hold to record"
                  : "Voice message — tap to switch to video circle, hold to record"
            }
            title={hasText ? "Send" : "Tap to switch · hold to record"}
            className="w-12 h-12 grid place-items-center rounded-full bg-white text-black transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 select-none [-webkit-touch-callout:none] touch-manipulation"
          >
            <span key={hasText ? "send" : mode} className="grid place-items-center animate-pop">
              {hasText ? <FiArrowUp size={20} strokeWidth={2.5} /> : mode === "video" ? <FiVideo size={19} /> : <FiMic size={19} />}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Composer;
