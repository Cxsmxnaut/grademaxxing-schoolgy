import { ThemeToggleButton } from "@/components/common/ThemeToggleButton";
import NotificationDropdown from "@/components/header/NotificationDropdown";
import UserDropdown from "@/components/header/UserDropdown";
import { useSidebar } from "@/context/SidebarContext";
import { MenuIcon, SearchIcon } from "@/icons";
import type React from "react";
import { useState } from "react";
import { useNavigate } from "react-router";

const AppHeader: React.FC = () => {
  const { toggleMobileSidebar } = useSidebar();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(
      trimmed ? `/feedback?search=${encodeURIComponent(trimmed)}` : "/feedback",
    );
  }

  return (
    <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-3 shadow-theme-xs sm:px-6 dark:bg-gray-900">
      <div className="flex items-center gap-3">
        <button
          onClick={toggleMobileSidebar}
          aria-label="Toggle sidebar"
          className="flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 xl:hidden dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <MenuIcon className="size-6" />
        </button>

        <div className="hidden xl:block">
          <form onSubmit={handleSearch} className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center">
              <SearchIcon className="size-5 fill-gray-500 dark:fill-gray-400" />
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search feedback, kinds, pages…"
              aria-label="Search the console"
              className="h-11 w-full max-w-md rounded-lg border border-gray-200 bg-transparent ps-11 pe-4 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-800 dark:text-white/90"
            />
          </form>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggleButton />
        <NotificationDropdown />
        <UserDropdown />
      </div>
    </header>
  );
};

export default AppHeader;
