import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Messenger from "./components/Messenger";
import Login from "./components/auth/Login";
import SetupRequired from "./components/SetupRequired";
import { LogoMark } from "./components/ui/Logo";
import UpdateToast from "./components/ui/UpdateToast";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { isSupabaseConfigured } from "./lib/supabase";

const Splash = () => (
  <div className="h-[100dvh] bg-space grid place-items-center">
    <LogoMark className="w-14 animate-pulse" />
  </div>
);

const RequireAuth = ({ children }) => {
  const { session, loading } = useAuth();
  if (loading) return <Splash />;
  return session ? children : <Navigate to="/login" replace />;
};

const GuestOnly = ({ children }) => {
  const { loading } = useAuth();
  return loading ? <Splash /> : children;
};

const App = () => {
  if (!isSupabaseConfigured) return <SetupRequired />;
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RequireAuth><Messenger /></RequireAuth>} />
          <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpdateToast />
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
