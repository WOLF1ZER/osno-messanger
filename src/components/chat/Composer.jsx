import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { FiPaperclip, FiSmile, FiMic, FiArrowUp } from "react-icons/fi";

// The emoji picker is large; load it only when first opened.
const EmojiPicker = lazy(() => import("emoji-picker-react"));

const Composer = ({ onSendText, onAttach, onRecord, disabled }) => {
  const [text, setText] = useState("");
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

  return (
    <div className="shrink-0 px-3 sm:px-5 pt-3 pb-safe border-t border-white/10 bg-black/60 backdrop-blur-xl">
      <div className="flex items-end gap-2">
        <div className="relative flex-1 flex items-end glass rounded-3xl pl-2 pr-1.5 transition-colors focus-within:border-white/30">
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
            className="flex-1 resize-none bg-transparent outline-none text-[15px] text-white placeholder:text-ink-400 py-3 px-1 max-h-[140px] leading-6 disabled:cursor-not-allowed"
          />

          <div className="flex items-center self-end pb-1">
            <button type="button" onClick={onAttach} className="icon-btn" aria-label="Attach file" disabled={disabled}>
              <FiPaperclip size={19} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={hasText ? send : onRecord}
          disabled={disabled}
          aria-label={hasText ? "Send message" : "Record voice message"}
          className="w-12 h-12 shrink-0 grid place-items-center rounded-full bg-white text-black transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100"
        >
          {hasText ? <FiArrowUp size={20} strokeWidth={2.5} /> : <FiMic size={19} />}
        </button>
      </div>
    </div>
  );
};

export default Composer;
