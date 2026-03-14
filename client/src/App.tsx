import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Lazy load all pages for code splitting
const DashboardLayout = lazy(() => import("@/components/DashboardLayout"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("@/pages/Home"));
const EntityDashboard = lazy(() => import("@/pages/EntityDashboard"));
const Entities = lazy(() => import("@/pages/Entities"));
const Transactions = lazy(() => import("@/pages/Transactions"));
const Investments = lazy(() => import("@/pages/Investments"));
const Rentals = lazy(() => import("@/pages/Rentals"));
const Reports = lazy(() => import("@/pages/Reports").then(m => ({ default: m.Reports })));
const TreasurySelix = lazy(() => import("@/pages/TreasurySelix"));
const OverallDashboard = lazy(() => import("@/pages/OverallDashboard"));
const Agenda = lazy(() => import("@/pages/Agenda"));
const Settings = lazy(() => import("@/pages/Settings"));
const UserProfile = lazy(() => import("@/pages/UserProfile"));
const AcceptInvite = lazy(() => import("@/pages/AcceptInvite"));
const Signup = lazy(() => import("@/pages/Signup"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const GoogleAuthSuccess = lazy(() => import("@/pages/GoogleAuthSuccess"));
const Admin = lazy(() => import("@/pages/Admin"));
const Planos = lazy(() => import("@/pages/Planos"));
const BillingSuccess = lazy(() => import("@/pages/BillingSuccess"));
const BankAccounts = lazy(() => import("@/pages/BankAccounts"));

// Loading fallback - minimal spinner
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={() => <DashboardLayout><Home /></DashboardLayout>} />
        <Route path="/dashboard/:id" component={() => <DashboardLayout><EntityDashboard /></DashboardLayout>} />
        <Route path="/entities" component={() => <DashboardLayout><Entities /></DashboardLayout>} />
        <Route path="/transactions" component={() => <DashboardLayout><Transactions /></DashboardLayout>} />
        <Route path="/investments/:entityId" component={() => <DashboardLayout><Investments /></DashboardLayout>} />
        <Route path="/rentals/:entityId" component={() => <DashboardLayout><Rentals /></DashboardLayout>} />
        <Route path="/reports/:entityId" component={() => <DashboardLayout><Reports /></DashboardLayout>} />
        <Route path="/treasury-selic/:entityId" component={() => <DashboardLayout><TreasurySelix /></DashboardLayout>} />
        <Route path="/overall-dashboard" component={() => <DashboardLayout><OverallDashboard /></DashboardLayout>} />
        <Route path="/agenda" component={() => <DashboardLayout><Agenda /></DashboardLayout>} />
        <Route path="/bank-accounts" component={() => <DashboardLayout><BankAccounts /></DashboardLayout>} />
        <Route path="/settings" component={() => <DashboardLayout><Settings /></DashboardLayout>} />
        <Route path="/profile" component={() => <DashboardLayout><UserProfile /></DashboardLayout>} />
        <Route path="/convite/:token" component={AcceptInvite} />
        <Route path="/signup" component={Signup} />
        <Route path="/verificar-email" component={VerifyEmail} />
        <Route path="/auth/google/success" component={GoogleAuthSuccess} />
        <Route path="/admin" component={() => <DashboardLayout><Admin /></DashboardLayout>} />
        <Route path="/planos" component={() => <DashboardLayout><Planos /></DashboardLayout>} />
        <Route path="/billing/success" component={BillingSuccess} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
