import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Workspace from "@/pages/Workspace";
import Settings from "@/pages/Settings";
import Leads from "@/pages/Leads";
import LeadDetail from "@/pages/LeadDetail";
import Deals from "@/pages/Deals";
import Meetings from "@/pages/Meetings";
import Payments from "@/pages/Payments";
import Campaigns from "@/pages/Campaigns";
import Team from "@/pages/Team";
import AuditLog from "@/pages/AuditLog";
import PaymentReturn from "@/pages/PaymentReturn";

function Protected({ children, adminOnly }) {
  const { user, isAdmin } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400 text-sm">
        Loading…
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<Protected><Dashboard /></Protected>} />
              <Route path="/workspace" element={<Protected><Workspace /></Protected>} />
              <Route path="/leads" element={<Protected><Leads /></Protected>} />
              <Route path="/leads/:id" element={<Protected><LeadDetail /></Protected>} />
              <Route path="/deals" element={<Protected><Deals /></Protected>} />
              <Route path="/meetings" element={<Protected><Meetings /></Protected>} />
              <Route path="/payments" element={<Protected><Payments /></Protected>} />
              <Route path="/payment-return" element={<Protected><PaymentReturn /></Protected>} />
              <Route path="/settings" element={<Protected><Settings /></Protected>} />
              <Route path="/campaigns" element={<Protected adminOnly><Campaigns /></Protected>} />
              <Route path="/team" element={<Protected adminOnly><Team /></Protected>} />
              <Route path="/audit" element={<Protected adminOnly><AuditLog /></Protected>} />
            </Routes>
            <Toaster position="top-right" />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
