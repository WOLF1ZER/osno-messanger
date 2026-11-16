import { AnimatePresence, motion } from "framer-motion";
import { MdOutlineKeyboardArrowDown } from "react-icons/md";

/** Glass section with a header that toggles its body. */
const Accordion = ({ title, icon: Icon, open, onToggle, children, right }) => (
  <div className="glass">
    <button onClick={onToggle} className="w-full flex items-center justify-between gap-4 px-5 h-16 text-left group">
      <span className="flex items-center gap-4">
        {Icon && <Icon size={18} className="text-ink-300 group-hover:text-white transition-colors" />}
        <span className="label text-ink-100">{title}</span>
      </span>
      {right ?? (
        <MdOutlineKeyboardArrowDown
          size={22}
          className={`text-ink-300 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
        />
      )}
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div className="px-5 pb-5 pt-1 border-t border-white/5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export default Accordion;
