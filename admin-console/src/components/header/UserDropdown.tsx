import { Dropdown } from "@/components/ui/dropdown/Dropdown";
import { useAuth } from "@/context/AuthContext";
import { LogoutIcon, UserCircleIcon } from "@/icons";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function UserDropdown() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const displayName = user?.displayName ?? "Administrator";
  const initials = displayName
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    setIsOpen(false);
    navigate("/signin", { replace: true });
    setBusy(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="dropdown-toggle flex items-center gap-3"
        aria-label="Open user menu"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
          {initials}
        </span>
        <span className="hidden text-start lg:block">
          <span className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {displayName}
          </span>
          <span className="block text-theme-xs text-gray-400">
            {user?.role ?? "Administrator"}
          </span>
        </span>
        <svg
          className={`stroke-gray-500 transition-transform duration-200 dark:stroke-gray-400 ${
            isOpen ? "rotate-180" : ""
          }`}
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4.79175 7.396L10.0001 12.6043L15.2084 7.396"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Dropdown isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <div className="px-4 py-3">
          <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
            {displayName}
          </p>
          <p className="mt-0.5 text-theme-xs text-gray-400">
            {user?.username ?? "admin"}
          </p>
        </div>
        <div className="border-t border-gray-100 p-2 dark:border-gray-800">
          <Link
            to="/profile"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <UserCircleIcon className="size-5" />
            Profile
          </Link>
          <button
            onClick={() => void handleSignOut()}
            disabled={busy}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            <LogoutIcon className="size-5" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </Dropdown>
    </div>
  );
}
