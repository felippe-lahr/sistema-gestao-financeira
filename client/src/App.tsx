import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import EntityDashboard from "@/pages/EntityDashboard";
import Entities from "@/pages/Entities";
import Transactions from "@/pages/Transactions";
import Settings from "@/pages/Settings";
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
      <Route path="/settings" component={() => <DashboardLayout><Settings /></DashboardLayout>} />
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
