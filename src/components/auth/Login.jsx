import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { FiEye, FiEyeOff, FiArrowRight } from "react-icons/fi";
import { LogoMark, Wordmark } from "../ui/Logo";
import InstallApp from "../ui/InstallApp";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Login = () => {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("login"); // login | signup
  const [form, setForm] = useState({ nickname: "", email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isLogin = mode === "login";

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!isLogin && !form.nickname.trim()) return setError("Choose a nickname.");
    if (!EMAIL_RE.test(form.email)) return setError("Enter a valid email address.");
    if (form.password.length < (isLogin ? 1 : 8))
      return setError(isLogin ? "Enter your password." : "Password must be at least 8 characters.");

    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (isLogin) {
        const { error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (err) throw err;
        navigate("/");
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { name: form.nickname.trim() }, emailRedirectTo: window.location.origin },
        });
        if (err) throw err;
        if (data.session) navigate("/");
        else setNotice(`Almost there — confirm your account from the email we sent to ${form.email}.`);
      }
    } catch (err) {
      const msg = err.message ?? "";
      setError(
        msg === "Invalid login credentials"
          ? "Wrong email or password."
          : /fetch|network/i.test(msg)
            ? "Can't reach the server. Check your connection and the Supabase URL in .env.local."
            : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const magicLink = async () => {
    if (!EMAIL_RE.test(form.email)) return setError("Enter your email first, then request a link.");
    setBusy(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: form.email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setBusy(false);
    if (err) setError(err.message);
    else setNotice(`Login link sent to ${form.email}. Check your inbox.`);
  };

  if (session) return <Navigate to="/" replace />;

  return (
    <div className="h-full w-full bg-space relative overflow-y-auto overflow-x-hidden flex flex-col">
      <div className="absolute inset-0 bg-grid pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      {/* horizon glow */}
      <div className="absolute -bottom-[40vh] left-1/2 -translate-x-1/2 w-[160vw] h-[60vh] rounded-[50%] bg-white/[0.04] blur-3xl pointer-events-none" />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 sm:px-10 pt-safe h-[calc(5rem+env(safe-area-inset-top))] shrink-0">
        <div className="flex items-center gap-3">
          <LogoMark className="w-7" />
          <Wordmark className="text-base" />
        </div>
        <div className="flex items-center gap-8">
          <nav className="hidden md:flex gap-8">
            {["Messages", "Groups", "Calls"].map((t) => (
              <span key={t} className="label text-[12px] text-ink-300">{t}</span>
            ))}
          </nav>
          <InstallApp variant="button" />
        </div>
      </header>

      <div className="relative z-10 flex-1 grid lg:grid-cols-2 items-center gap-10 px-6 sm:px-10 pb-12 max-w-7xl w-full mx-auto">
        {/* Hero copy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="hidden lg:block"
        >
          <p className="eyebrow mb-6">Private messaging &amp; calls</p>
          <h1 className="font-display font-bold uppercase text-white text-7xl xl:text-8xl leading-[0.92] tracking-wide">
            Talk.<br />Share.<br />
            <span className="text-ink-400">Disappear.</span>
          </h1>
          <p className="mt-8 max-w-md text-ink-300 leading-relaxed">
            Messages, groups, voice notes, files and video calls — wrapped in a quiet, focused interface built for the
            people you actually talk to. Install it as an app on any device.
          </p>
        </motion.div>

        {/* Auth card */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="w-full max-w-md mx-auto lg:ml-auto"
        >
          <div className="glass-strong p-8 sm:p-10">
            <div className="lg:hidden flex flex-col items-center text-center mb-8">
              <LogoMark className="w-14 mb-5" />
              <h1 className="font-display font-bold uppercase text-white text-4xl tracking-wide">
                {isLogin ? "Welcome back" : "Join OSNO"}
              </h1>
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 mb-8 border-b border-white/10">
              {[
                ["login", "Log in"],
                ["signup", "Sign up"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => {
                    setMode(id);
                    setError("");
                    setNotice("");
                  }}
                  className={`relative pb-4 label transition-colors ${mode === id ? "text-white" : "text-ink-400 hover:text-ink-200"}`}
                >
                  {label}
                  {mode === id && <motion.span layoutId="tab" className="absolute left-0 right-0 -bottom-px h-[2px] bg-white" />}
                </button>
              ))}
            </div>

            <form onSubmit={submit} noValidate>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={mode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  {!isLogin && (
                    <div>
                      <label htmlFor="nickname" className="eyebrow block mb-2">Nickname</label>
                      <input id="nickname" maxLength={20} value={form.nickname} onChange={set("nickname")} className="field" autoComplete="nickname" />
                    </div>
                  )}
                  <div>
                    <label htmlFor="email" className="eyebrow block mb-2">Email</label>
                    <input id="email" type="email" value={form.email} onChange={set("email")} className="field" autoComplete="email" placeholder="you@example.com" />
                  </div>
                  <div>
                    <label htmlFor="password" className="eyebrow block mb-2">Password</label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPw ? "text" : "password"}
                        value={form.password}
                        onChange={set("password")}
                        className="field pr-12"
                        autoComplete={isLogin ? "current-password" : "new-password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-white"
                        aria-label={showPw ? "Hide password" : "Show password"}
                      >
                        {showPw ? <FiEyeOff size={17} /> : <FiEye size={17} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {error && <p className="mt-5 text-sm text-white border-l-2 border-white pl-3">{error}</p>}
              {notice && <p className="mt-5 text-sm text-ink-200 border-l-2 border-ink-400 pl-3">{notice}</p>}

              <button type="submit" disabled={busy} className="btn-solid w-full mt-8 h-12 group">
                {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
                <FiArrowRight className="transition-transform group-hover:translate-x-1" />
              </button>

              {isLogin && (
                <p className="mt-6 text-center text-sm text-ink-400">
                  Forgot your password?{" "}
                  <button type="button" onClick={magicLink} className="text-white underline underline-offset-4 decoration-white/30 hover:decoration-white">
                    Log in via link
                  </button>
                </p>
              )}
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;
