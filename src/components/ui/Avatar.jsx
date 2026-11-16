import { useState } from "react";
import { FiUsers } from "react-icons/fi";
import { initials } from "../../lib/format";

const SIZES = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-9 h-9 text-[12px]",
  md: "w-12 h-12 text-[14px]",
  lg: "w-16 h-16 text-lg",
  xl: "w-28 h-28 text-3xl",
  "2xl": "w-36 h-36 text-4xl",
};

/** Monochrome avatar: photo if available, otherwise initials on a graphite gradient. */
const Avatar = ({ name = "", src, size = "md", online = false, group = false, className = "" }) => {
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = src && failedSrc !== src;

  return (
    <div className={`relative shrink-0 ${className}`}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          onError={() => setFailedSrc(src)}
          className={`${SIZES[size]} rounded-full object-cover ring-1 ring-white/15 bg-ink-700`}
        />
      ) : (
        <div
          className={`${SIZES[size]} rounded-full grid place-items-center font-display font-semibold tracking-wider
            text-white bg-gradient-to-br from-ink-500 via-ink-700 to-ink-900 ring-1 ring-white/15`}
          aria-label={name}
        >
          {initials(name)}
        </div>
      )}
      {online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-white ring-2 ring-black" title="Online" />}
      {group && (
        <span className="absolute -bottom-0.5 -right-0.5 w-[38%] h-[38%] min-w-4 min-h-4 max-w-7 max-h-7 rounded-full bg-white text-black grid place-items-center ring-2 ring-black" title="Group">
          <FiUsers className="w-[60%] h-[60%]" />
        </span>
      )}
    </div>
  );
};

export default Avatar;
