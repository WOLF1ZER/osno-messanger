/**
 * Big uppercase name heading that copes with long names:
 * shrinks the font as the name gets longer, wraps even without spaces, and caps at 2 lines.
 * The full name is always available on hover (title) and to screen readers.
 */
const SIZES = {
  md: ["text-3xl", "text-2xl", "text-xl"],
  lg: ["text-4xl sm:text-6xl", "text-3xl sm:text-5xl", "text-2xl sm:text-4xl"],
};

const DisplayName = ({ name = "", size = "md", as: Tag = "h2", className = "" }) => {
  const [short, medium, long] = SIZES[size];
  const fit = name.length > 32 ? long : name.length > 18 ? medium : short;
  return (
    <Tag
      title={name}
      className={`max-w-full font-display font-bold uppercase tracking-wider text-white leading-tight
        [overflow-wrap:anywhere] line-clamp-2 ${fit} ${className}`}
    >
      {name}
    </Tag>
  );
};

export default DisplayName;
