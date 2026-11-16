import { LogoMark } from "./ui/Logo";

/** Shown instead of the app until .env.local has the Supabase keys. */
const SetupRequired = () => (
  <div className="min-h-[100dvh] bg-space bg-grid grid place-items-center px-6">
    <div className="glass-strong max-w-lg w-full p-8 sm:p-10">
      <LogoMark className="w-12 mb-6" />
      <p className="eyebrow mb-2">Setup</p>
      <h1 className="font-display font-bold uppercase tracking-wider text-white text-3xl mb-4">Connect Supabase</h1>
      <p className="text-ink-300 leading-relaxed text-sm">
        Create a file named <code className="text-white">.env.local</code> in the project root (copy{" "}
        <code className="text-white">.env.example</code>) and add your keys:
      </p>
      <pre className="mt-4 p-4 bg-black/60 border border-white/10 text-[12px] text-ink-200 overflow-x-auto">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_LIVEKIT_URL=wss://xxxx.livekit.cloud`}
      </pre>
      <p className="text-ink-400 text-sm mt-4">Then restart <code className="text-white">npm run dev</code>. Full steps are in README.md.</p>
    </div>
  </div>
);

export default SetupRequired;
