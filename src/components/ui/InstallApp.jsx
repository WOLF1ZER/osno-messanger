import { useState } from "react";
import { FiDownload, FiCheck, FiShare, FiPlusSquare, FiMoreVertical } from "react-icons/fi";
import Modal from "./Modal";
import { useInstall } from "../../lib/pwa";

/** "Install app" — one click on Chrome/Edge/Android, instructions on iPhone/iPad and other browsers. */
const InstallApp = ({ variant = "row" }) => {
  const { state, install } = useInstall();
  const [help, setHelp] = useState(false);

  const onClick = async () => {
    if (state === "available") await install();
    else if (state !== "installed") setHelp(true);
  };

  const modal = (
    <Modal open={help} onClose={() => setHelp(false)} title="Install OSNO">
      {state === "ios" ? (
        <ol className="space-y-4 text-sm text-ink-200">
          <li className="flex gap-3"><span className="label text-white">1</span> Open this page in <b className="text-white">Safari</b>.</li>
          <li className="flex gap-3 items-center"><span className="label text-white">2</span> Tap <FiShare className="text-white" /> <b className="text-white">Share</b> in the toolbar.</li>
          <li className="flex gap-3 items-center"><span className="label text-white">3</span> Choose <FiPlusSquare className="text-white" /> <b className="text-white">Add to Home Screen</b>.</li>
          <li className="flex gap-3"><span className="label text-white">4</span> Open OSNO from your Home Screen — then you can turn on notifications.</li>
        </ol>
      ) : (
        <ol className="space-y-4 text-sm text-ink-200">
          <li className="flex gap-3 items-center"><span className="label text-white">1</span> Open your browser menu <FiMoreVertical className="text-white" />.</li>
          <li className="flex gap-3"><span className="label text-white">2</span> Choose <b className="text-white">Install app</b> / <b className="text-white">Add to Home screen</b>.</li>
          <li className="flex gap-3"><span className="label text-white">3</span> Chrome, Edge and Android browsers support this; Firefox on desktop does not.</li>
        </ol>
      )}
      <button onClick={() => setHelp(false)} className="btn-solid w-full mt-6">Got it</button>
    </Modal>
  );

  if (variant === "button") {
    if (state === "installed") return null;
    return (
      <>
        <button onClick={onClick} className="btn-ghost h-9 px-4">
          <FiDownload size={14} /> Install app
        </button>
        {modal}
      </>
    );
  }

  return (
    <>
      <button onClick={onClick} disabled={state === "installed"} className="glass w-full flex items-center justify-between px-5 h-16 group text-left">
        <span className="flex items-center gap-4">
          <FiDownload size={18} className="text-ink-300 group-hover:text-white transition-colors" />
          <span>
            <span className="label text-ink-100 block">{state === "installed" ? "App installed" : "Install app"}</span>
            <span className="text-[11px] text-ink-400">
              {state === "installed" ? "You're using the OSNO app" : "Standalone app on your phone or computer"}
            </span>
          </span>
        </span>
        {state === "installed" ? <FiCheck className="text-white" /> : <span className="eyebrow text-white">{state === "available" ? "Install" : "How"}</span>}
      </button>
      {modal}
    </>
  );
};

export default InstallApp;
