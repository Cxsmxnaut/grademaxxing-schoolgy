import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { adminApi, ApiError, type AdminUser } from "@/lib/api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  user: AdminUser | null;
  status: AuthStatus;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const session = await adminApi.session();
      const active = session.authenticated && Boolean(session.user);
      setUser(active ? (session.user ?? null) : null);
      setStatus(active ? "authenticated" : "anonymous");
    } catch {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      try {
        await adminApi.signIn(username, password);
      } catch (error) {
        throw error instanceof ApiError
          ? error
          : new ApiError(
              "The console could not reach the server. Reconnect and try again.",
              0,
            );
      }
      await refresh();
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    await adminApi.signOut().catch(() => undefined);
    setUser(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut, refresh }),
    [user, status, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within an AuthProvider");
  return context;
}

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading")
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-gray-900">
        <div
          className="size-10 animate-spin rounded-full border-4 border-gray-200 border-t-brand-500 dark:border-gray-800 dark:border-t-brand-400"
          role="status"
          aria-label="Checking admin session"
        />
      </div>
    );

  if (status === "anonymous")
    return <Navigate to="/signin" replace state={{ from: location }} />;

  return <Outlet />;
}
