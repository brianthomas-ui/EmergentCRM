import { lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TabsProvider } from "@/context/TabsContext";
import { Toaster } from "@/components/ui/sonner";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";

// Route pages are code-split so the first mobile paint ships only the shell + the
// landed route, not every recharts-heavy page. Login stays eager (it is the entry).
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Settings = lazy(() => import("@/pages/Settings"));
const Leads = lazy(() => import("@/pages/Leads"));
const LeadDetail = lazy(() => import("@/pages/LeadDetail"));
const Deals = lazy(() => import("@/pages/Deals"));
const Meetings = lazy(() => import("@/pages/Meetings"));
const Payments = lazy(() => import("@/pages/Payments"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const Team = lazy(() => import("@/pages/Team"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const PaymentReturn = lazy(() => import("@/pages/PaymentReturn"));

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
            <TabsProvider>
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
            </TabsProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}

export default App;
