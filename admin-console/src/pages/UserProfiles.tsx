import PageMeta from "@/components/common/PageMeta";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import { KeyIcon, LockIcon, UserCircleIcon } from "@/icons";

export default function UserProfiles() {
  const { user } = useAuth();
  const displayName = user?.displayName ?? "Administrator";
  const initials = displayName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <PageMeta
        title="Grademaxxing Admin — Profile"
        description="Operator profile for the Grademaxxing operations console."
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 sm:p-6">
        <div className="mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">Account</p>
          <h1 className="mt-1 text-title-xl font-semibold text-gray-800 dark:text-white/90">
            Profile
          </h1>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mx-auto flex size-24 items-center justify-center rounded-full bg-brand-50 text-2xl font-bold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
              {initials}
            </div>
            <h2 className="mt-4 text-lg font-semibold text-gray-800 dark:text-white/90">
              {displayName}
            </h2>
            <div className="mt-2 flex justify-center">
              <Badge color="primary" size="sm">
                {user?.role ?? "Administrator"}
              </Badge>
            </div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Sole operator of the Grademaxxing operations console. Everything
              here is aggregate and privacy-safe — no student records are
              stored or shown.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 xl:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Console access
            </h2>
            <div className="mt-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                  <UserCircleIcon className="size-6" />
                </div>
                <div>
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    Username
                  </p>
                  <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">
                    {user?.username ?? "—"} — used for every console sign-in.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                  <KeyIcon className="size-6" />
                </div>
                <div>
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    Password
                  </p>
                  <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">
                    Stored only as a one-way digest. Rotate it via the
                    environment configuration without a redeploy of code.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                  <LockIcon className="size-6" />
                </div>
                <div>
                  <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                    Sessions
                  </p>
                  <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">
                    Signed, http-only cookies that expire after 8 hours.
                    Sign-in attempts are rate-limited per address.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
