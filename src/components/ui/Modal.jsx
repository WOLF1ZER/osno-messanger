import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IoClose } from "react-icons/io5";

/**
 * Centered glass dialog. Closes on backdrop click and Escape.
 * Replaces the per-component "mousedown outside" listeners the draft duplicated everywhere.
 */
const Modal = ({ open, onClose, title, children, className = "" }) => {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`glass-strong w-full max-w-sm p-6 ${className}`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {title && (
              <div className="flex items-center justify-between mb-6">
                <h2 className="label text-white">{title}</h2>
                <button onClick={onClose} className="icon-btn -mr-2" aria-label="Close">
                  <IoClose size={20} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
