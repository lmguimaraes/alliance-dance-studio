import { Toaster } from "@/components/ui/sonner";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import About from "./pages/About";
import Admin from "./pages/Admin";
import Classes from "./pages/Classes";
import Contact from "./pages/Contact";
import Gallery from "./pages/Gallery";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import StudioRental from "./pages/StudioRental";

function brandTheme(location: string): string {
  if (location.startsWith("/about") || location.startsWith("/gallery")) {
    return "brand-company";
  }
  if (location.startsWith("/classes")) return "brand-classes";
  if (location.startsWith("/studio-rental")) return "brand-studio";
  return "brand-alliance";
}

function Router() {
  const [location] = useLocation();

  return (
    <div className={brandTheme(location)}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/classes" component={Classes} />
        <Route path="/studio-rental" component={StudioRental} />
        <Route path="/gallery" component={Gallery} />
        <Route path="/contact" component={Contact} />
        <Route path="/admin" component={Admin} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <Toaster />
        <Router />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
