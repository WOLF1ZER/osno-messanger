import { MdOutlineKeyboardArrowLeft } from "react-icons/md";
import { HiOutlineMenuAlt2 } from "react-icons/hi";

/**
 * SpaceX-style section header: small eyebrow + big condensed uppercase title.
 * On phones it can show a Telegram-style ☰ button (onMenu) or a back arrow (onBack).
 */
const PanelHeader = ({ eyebrow, title, onBack, onMenu, right, backAlways = false }) => (
  <div className="flex items-end justify-between gap-4 px-5 pt-6 pb-5">
    <div className="flex items-center gap-2 min-w-0">
      {onMenu && (
        <button onClick={onMenu} className="icon-btn -ml-2 md:hidden" aria-label="Open menu">
          <HiOutlineMenuAlt2 size={24} />
        </button>
      )}
      {onBack && (
        <button onClick={onBack} className={`icon-btn -ml-2 ${backAlways ? "" : "md:hidden"}`} aria-label="Back">
          <MdOutlineKeyboardArrowLeft size={26} />
        </button>
      )}
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display font-bold uppercase tracking-wider text-white text-3xl leading-none truncate">
          {title}
        </h1>
      </div>
    </div>
    {right}
  </div>
);

export default PanelHeader;
