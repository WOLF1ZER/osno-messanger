import { FiRefreshCw } from "react-icons/fi";
import { LogoMark, Wordmark } from "./ui/Logo";

/**
 * Shown when the app was built without its Supabase keys.
 *  - Live site: a friendly "unavailable" page (no technical details for visitors).
 *  - npm run dev: setup instructions for the developer.
 */
const SetupRequired = () => {
  if (import.meta.env.DEV) {
    return (
      <div className="min-h-[100dvh] bg-space bg-grid grid place-items-center px-6">
        <div className="glass-strong max-w-lg w-full p-8 sm:p-10">
          <LogoMark className="w-12 mb-6" />
          <p className="eyebrow mb-2">Developer setup</p>
          <h1 className="font-display font-bold uppercase tracking-wider text-white text-3xl mb-4">Connect Supabase</h1>
          <p className="text-ink-300 leading-relaxed text-sm">
            Create <code className="text-white">.env.local</code> in the project root (copy{" "}
            <code className="text-white">.env.example</code>) and add your keys:
          </p>
          <pre className="mt-4 p-4 bg-black/60 border border-white/10 text-[12px] text-ink-200 overflow-x-auto">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_LIVEKIT_URL=wss://xxxx.livekit.cloud
VITE_VAPID_PUBLIC_KEY=B...`}
          </pre>
          <p className="text-ink-400 text-sm mt-4">
            Then restart <code className="text-white">npm run dev</code>. On Vercel, add the same variables in Project → Settings →
            Environment Variables and redeploy. This message is only shown in development.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-space relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-grid pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />

      <header className="relative z-10 flex items-center gap-3 px-6 sm:px-10 h-20">
        <LogoMark className="w-7" />
        <Wordmark className="text-base" />
      </header>

      <main className="relative z-10 flex-1 grid place-items-center px-6 pb-20 text-center">
        <div className="max-w-xl">
          <p className="eyebrow mb-6">Service status</p>
          <h1 className="font-display font-bold uppercase text-white text-5xl sm:text-7xl leading-[0.95] tracking-wide">
            We&apos;ll be
            <br />
            right back
          </h1>
          <p className="mt-8 text-ink-300 leading-relaxed">
            OSNO can&apos;t connect right now. Your messages are safe — please try again in a few minutes.
          </p>
          <button onClick={() => window.location.reload()} className="btn-solid mt-10 h-12 px-8">
            <FiRefreshCw size={15} /> Try again
          </button>
        </div>
      </main>
    </div>
  );
};

export default SetupRequired;
