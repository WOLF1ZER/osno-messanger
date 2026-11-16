import { FiRefreshCw } from "react-icons/fi";
import { IoClose } from "react-icons/io5";
import { applyUpdate, dismissUpdate, useUpdateAvailable } from "../../lib/pwa";

/** Shown when a new version of the app has been deployed. */
const UpdateToast = () => {
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div className="fixed bottom-28 md:bottom-6 left-1/2 -translate-x-1/2 z-[400] glass-strong flex items-center gap-3 pl-4 pr-2 py-2 animate-fade-up max-w-[92vw]" role="status">
      <FiRefreshCw className="text-white shrink-0" />
      <span className="text-sm text-white">A new version of OSNO is ready.</span>
      <button onClick={applyUpdate} className="h-8 px-4 rounded-full bg-white text-black text-xs font-display uppercase tracking-wider2 font-semibold shrink-0">
        Update
      </button>
      <button onClick={dismissUpdate} className="icon-btn w-8 h-8" aria-label="Later">
        <IoClose size={16} />
      </button>
    </div>
  );
};

export default UpdateToast;
