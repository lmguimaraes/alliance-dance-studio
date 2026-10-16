import { lazy, Suspense, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { Toaster } from "sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import PageLayout from "./components/PageLayout";
import { CartProvider } from "./features/cart/CartContext";
import CartDrawer from "./features/cart/CartDrawer";
import { PATHS } from "./lib/brand";
import { currentLanguage } from "./lib/format";
import HomePage from "./pages/home/HomePage";

const DiscoverPage = lazy(() => import("./pages/discover/DiscoverPage"));
const ClassesPage = lazy(() => import("./pages/classes/ClassesPage"));
const StudioRentalPage = lazy(() => import("./pages/rental/StudioRentalPage"));
const CheckoutPage = lazy(() => import("./pages/checkout/CheckoutPage"));
const ContactPage = lazy(() => import("./pages/contact/ContactPage"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));

/** Scrolls to the top on navigation, and keeps <html lang> in sync. */
function DocumentEffects() {
  const [location] = useLocation();
  const { i18n } = useTranslation();
  const language = currentLanguage(i18n.resolvedLanguage ?? i18n.language);

  useEffect(() => {
    if (!window.location.hash) window.scrollTo({ top: 0 });
  }, [location]);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

function PublicRoutes() {
  return (
    <PageLayout>
      <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
        <Switch>
          <Route path={PATHS.home} component={HomePage} />
          <Route path="/discover">
            <Redirect to={PATHS.discover()} replace />
          </Route>
          <Route path="/discover/:section" component={DiscoverPage} />
          <Route path="/about">
            <Redirect to={PATHS.discover("story")} replace />
          </Route>
          <Route path="/gallery">
            <Redirect to={PATHS.discover("gallery")} replace />
          </Route>
          <Route path={PATHS.classes} component={ClassesPage} />
          <Route path={PATHS.rental} component={StudioRentalPage} />
          <Route path={PATHS.checkout} component={CheckoutPage} />
          <Route path={PATHS.contact} component={ContactPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </PageLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <CartProvider>
        <DocumentEffects />
        <Toaster
          theme="dark"
          position="bottom-center"
          closeButton
          toastOptions={{ className: "toast" }}
        />
        <Switch>
          <Route path={PATHS.admin}>
            <Suspense
              fallback={<div className="route-loading" aria-busy="true" />}
            >
              <AdminPage />
            </Suspense>
          </Route>
          <Route>
            <PublicRoutes />
          </Route>
        </Switch>
        <CartDrawer />
      </CartProvider>
    </ErrorBoundary>
  );
}
