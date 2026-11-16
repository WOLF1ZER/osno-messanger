import { FiSearch, FiX } from "react-icons/fi";

const SearchField = ({ value, onChange, placeholder = "Search", autoFocus }) => (
  <div className="relative">
    <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none" size={16} />
    <input
      type="search"
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="field pl-11 pr-10 [&::-webkit-search-cancel-button]:hidden"
    />
    {value && (
      <button
        onClick={() => onChange("")}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
        aria-label="Clear search"
      >
        <FiX size={16} />
      </button>
    )}
  </div>
);

export default SearchField;
