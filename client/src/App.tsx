import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import EntityDashboard from "@/pages/EntityDashboard";
import Entities from "@/pages/Entities";
import Transactions from "@/pages/Transactions";
import Investments from "@/pages/Investments";
import Rentals from "@/pages/Rentals";
import { Reports } from "@/pages/Reports";
import TreasurySelix from "@/pages/TreasurySelix";
import OverallDashboard from "@/pages/OverallDashboard";
import Agenda from "@/pages/Agenda";
import Settings from "@/pages/Settings";
import UserProfile from "@/pages/UserProfile";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
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
      <Route path="/settings" component={() => <DashboardLayout><Settings /></DashboardLayout>} />
      <Route path="/profile" component={() => <DashboardLayout><UserProfile /></DashboardLayout>} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
