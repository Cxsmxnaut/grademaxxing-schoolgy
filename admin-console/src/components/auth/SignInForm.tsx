import Label from "@/components/form/Label";
import Input from "@/components/form/input/InputField";
import Button from "@/components/ui/button/Button";
import { useAuth } from "@/context/AuthContext";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import { ApiError } from "@/lib/api";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router";

export default function SignInForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();
  const [signingIn, setSigningIn] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (signingIn || !username.trim() || !password) return;
    setSigningIn(true);
    setError(undefined);
    try {
      await signIn(username, password);
      const from = (location.state as { from?: { pathname?: string } })?.from;
      navigate(from?.pathname ?? "/", { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to sign in. Reconnect and try again.",
      );
      setPassword("");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-md pt-10">
        <a
          href="https://grademaxxing.app"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          ← Back to grademaxxing.app
        </a>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Private Grademaxxing operations console. Authorized operators
              only.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <Label htmlFor="username">
                  Username <span className="text-error-500">*</span>
                </Label>
                <Input
                  id="username"
                  name="username"
                  autoComplete="username"
                  placeholder="bhavith lolakapuri"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="password">
                  Password <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <span
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-e-4 top-1/2 z-30 -translate-y-1/2 cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
                    ) : (
                      <EyeCloseIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
                    )}
                  </span>
                </div>
              </div>
              <div>
                <Button className="w-full" size="sm" disabled={signingIn}>
                  {signingIn ? "Signing in…" : "Open dashboard"}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-6">
            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              Sessions expire after 8 hours. Access attempts are rate-limited.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
