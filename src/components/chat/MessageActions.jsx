import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiCornerUpLeft, FiCopy, FiCheck } from "react-icons/fi";
import { messagePreview } from "../../lib/format";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

/**
 * Menu for one message (long-press on phones, right-click / hover button on desktop):
 * quick reactions, reply, copy. Bottom sheet on phones, small card on larger screens.
 */
const MessageActions = ({ message, myReaction, onReact, onReply, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!message) return;
    setCopied(false);
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  const text = message?.text ?? message?.caption;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(onClose, 500);
    } catch {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="Message actions"
            className="w-full max-w-sm glass-strong rounded-3xl p-3"
            initial={{ y: 24, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 pt-1 pb-3 text-sm text-ink-300 line-clamp-2 [overflow-wrap:anywhere]">{messagePreview(message)}</p>

            {/* quick reactions */}
            <div className="grid grid-cols-6 gap-1 p-1 rounded-2xl bg-white/[0.05] border border-white/10">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    onReact(e);
                    onClose();
                  }}
                  aria-label={`React ${e}`}
                  aria-pressed={myReaction === e}
                  className={`h-12 rounded-xl text-2xl grid place-items-center transition-transform active:scale-90 ${
                    myReaction === e ? "bg-white/20 ring-1 ring-white/40" : "hover:bg-white/10"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            <div className="mt-2 grid gap-1">
              <button
                onClick={() => {
                  onReply();
                  onClose();
                }}
                className="flex items-center gap-3 h-12 px-4 rounded-xl text-white hover:bg-white/10 text-left"
              >
                <FiCornerUpLeft size={18} /> Reply
              </button>
              {text && (
                <button onClick={copy} className="flex items-center gap-3 h-12 px-4 rounded-xl text-white hover:bg-white/10 text-left">
                  {copied ? <FiCheck size={18} /> : <FiCopy size={18} />} {copied ? "Copied" : "Copy text"}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MessageActions;
