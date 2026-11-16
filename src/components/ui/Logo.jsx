import logo from "../../assets/logo-mono.png";

/** The brand mark rendered in monochrome so it matches the black / gray palette. */
export const LogoMark = ({ className = "w-8" }) => (
  <img src={logo} alt="OSNO" className={`logo-mono select-none ${className}`} draggable={false} />
);

export const Wordmark = ({ className = "" }) => (
  <span className={`font-display font-bold uppercase tracking-widest2 text-white ${className}`}>OSNO</span>
);

export default LogoMark;
