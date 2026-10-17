import { useTranslation } from "react-i18next";
import { lazy, Suspense } from "react";
import { Route, BrowserRouter as Router, Routes } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";
import SignIn from "./pages/AuthPages/SignIn";
import NotFound from "./pages/OtherPage/NotFound";
const MaxDiagnosticsPage = lazy(() => import("./pages/MaxDiagnosticsPage"));
const Dashboard = lazy(() => import("./pages/Dashboard/Dashboard"));
const FeedbackInbox = lazy(() => import("./pages/FeedbackInbox"));
const ReferralsPage = lazy(() => import("./pages/ReferralsPage"));
const UserProfiles = lazy(() => import("./pages/UserProfiles"));
const UsersPage = lazy(() => import("./pages/UsersPage"));

export default function App() {
  const { t } = useTranslation();
  return (
    <Router basename="/admin-app">
      <AuthProvider>
        <ScrollToTop />
        <Suspense
          fallback={
            <div
              role="status"
              className="p-6 text-gray-500 dark:text-gray-400"
              aria-label={t("console.loadingPage")}
            />
          }
        >
          <Routes>
            {/* Authenticated console */}
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route index path="/" element={<Dashboard />} />
                <Route path="/max" element={<MaxDiagnosticsPage />} />
                <Route path="/feedback" element={<FeedbackInbox />} />
                <Route path="/referrals" element={<ReferralsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/profile" element={<UserProfiles />} />
              </Route>
            </Route>

            {/* Public */}
            <Route path="/signin" element={<SignIn />} />

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}
