import { Route, BrowserRouter as Router, Routes } from "react-router";
import { ScrollToTop } from "./components/common/ScrollToTop";
import { AuthProvider, RequireAuth } from "./context/AuthContext";
import AppLayout from "./layout/AppLayout";
import SignIn from "./pages/AuthPages/SignIn";
import Dashboard from "./pages/Dashboard/Dashboard";
import FeedbackInbox from "./pages/FeedbackInbox";
import NotFound from "./pages/OtherPage/NotFound";
import ReferralsPage from "./pages/ReferralsPage";
import UserProfiles from "./pages/UserProfiles";
import UsersPage from "./pages/UsersPage";

export default function App() {
  return (
    <Router basename="/admin-app">
      <AuthProvider>
        <ScrollToTop />
        <Routes>
          {/* Authenticated console */}
          <Route element={<RequireAuth />}>
            <Route element={<AppLayout />}>
              <Route index path="/" element={<Dashboard />} />
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
      </AuthProvider>
    </Router>
  );
}
