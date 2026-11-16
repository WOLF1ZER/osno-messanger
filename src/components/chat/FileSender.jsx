import { useEffect, useId, useState } from "react";
import { FiUploadCloud, FiX, FiFileText } from "react-icons/fi";
import Modal from "../ui/Modal";
import { formatBytes, truncateMiddle } from "../../lib/format";

/**
 * Fixes from the draft: the hidden <input type=file> had no onChange (clicking did nothing),
 * its id clashed with the avatar uploader, and the Send button closed the dialog even with no files.
 */
const FileSender = ({ open, onClose, onSend }) => {
  const inputId = useId();
  const [files, setFiles] = useState([]);
  const [caption, setCaption] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setCaption("");
      setDragging(false);
    }
  }, [open]);

  const addFiles = (list) => {
    const incoming = Array.from(list ?? []);
    setFiles((prev) => {
      const key = (f) => `${f.name}-${f.size}-${f.lastModified}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...incoming.filter((f) => !seen.has(key(f)))];
    });
  };

  const send = () => {
    if (!files.length) return;
    onSend(files, caption.trim());
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Send files" className="max-w-md">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-3 h-40 border border-dashed cursor-pointer transition-colors ${
          dragging ? "border-white bg-white/10" : "border-white/25 bg-white/[0.02] hover:border-white/60"
        }`}
      >
        <FiUploadCloud size={28} className="text-ink-200" />
        <p className="label text-ink-200">Drop files or click to browse</p>
        <p className="text-xs text-ink-400">Images, documents, archives</p>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-4 max-h-48 overflow-y-auto space-y-2">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 bg-white/[0.04] border border-white/10">
              {f.type.startsWith("image/") ? (
                <img src={URL.createObjectURL(f)} alt="" className="w-9 h-9 object-cover" onLoad={(e) => URL.revokeObjectURL(e.currentTarget.src)} />
              ) : (
                <div className="w-9 h-9 grid place-items-center bg-white/10">
                  <FiFileText size={16} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{truncateMiddle(f.name, 30)}</p>
                <p className="text-[11px] text-ink-400">{formatBytes(f.size)}</p>
              </div>
              <button
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="icon-btn w-8 h-8"
                aria-label={`Remove ${f.name}`}
              >
                <FiX size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder="Add a caption (optional)"
        className="field mt-4"
      />

      <button onClick={send} disabled={!files.length} className="btn-solid w-full mt-4">
        Send {files.length > 0 && `(${files.length})`}
      </button>
    </Modal>
  );
};

export default FileSender;
