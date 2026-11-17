import { FiMessageSquare, FiPhone, FiUser, FiUserPlus } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import { LogoMark } from "../ui/Logo";

// Order matters: Messages, then Calls.
const NAV_ITEMS = [
  { id: "chats", label: "Chats", icon: FiMessageSquare },
  { id: "calls", label: "Calls", icon: FiPhone },
  { id: "search", label: "New chat", icon: FiUserPlus },
  { id: "profile", label: "Profile", icon: FiUser },
];

const badgeFor = (id, { unread, missed }) => (id === "chats" ? unread : id === "calls" ? missed : 0);

/** Vertical glass rail for tablet / desktop. */
export const NavRail = ({ view, onChange, me, unread, missed }) => (
  <nav className="hidden md:flex flex-col items-center w-[76px] shrink-0 h-full py-4 border-r border-white/10 bg-white/[0.02] backdrop-blur-xl">
    <LogoMark className="w-9 mb-10" />

    <div className="flex flex-col items-center gap-2 flex-1">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        const badge = badgeFor(id, { unread, missed });
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`group relative w-12 h-12 grid place-items-center rounded-xl transition-all duration-300 ${
              active ? "bg-white text-black" : "text-ink-300 hover:text-white hover:bg-white/10"
            }`}
          >
            <Icon size={20} />
            {badge > 0 && !active && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-white" />}
            <span className="pointer-events-none absolute left-full ml-3 px-3 py-1.5 whitespace-nowrap glass-strong label text-[11px] text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 z-50">
              {label}
            </span>
          </button>
        );
      })}
    </div>

    <div className="flex flex-col items-center gap-4">
      <button onClick={() => onChange("profile")} title={me.name} aria-label="Your profile">
        <Avatar name={me.name} src={me.avatar} size="sm" className="hover:scale-105 transition-transform" />
      </button>
    </div>
  </nav>
);

/**
 * Floating rounded glass tab bar for phones (Telegram iOS style).
 * Content scrolls underneath it, so the blur gives the glass look.
 */
export const MobileTabBar = ({ view, onChange, unread, missed }) => (
  <nav
    className="md:hidden absolute inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    aria-label="Main"
  >
    <div className="pointer-events-auto mx-auto max-w-md grid grid-cols-4 gap-1 p-1.5 rounded-full bg-ink-800/60 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.08)]">
      {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
        const active = view === id;
        const badge = badgeFor(id, { unread, missed });
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-1 h-14 rounded-full transition-all duration-300 ${
              active ? "bg-black/80 text-white shadow-inner ring-1 ring-white/10" : "text-ink-300 active:scale-95"
            }`}
          >
            <span className="relative">
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              {badge > 0 && (
                <span className="absolute -top-2 left-3 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-black text-[10px] font-bold grid place-items-center ring-2 ring-ink-900">
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-semibold tracking-wide">{label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);
