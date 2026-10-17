import { useTranslation } from "react-i18next";
import { useSidebar } from "@/context/SidebarContext";
import {
  ChatIcon,
  GridIcon,
  HorizontaLDots,
  MultiUserIcon,
  UserCircleIcon,
  UserMoneyIcon,
} from "@/icons";
import { cn } from "@/utils";
import type React from "react";
import { Link, useLocation } from "react-router";
import SidebarWidget from "./SidebarWidget";

type NavItem = {
  name: string;
  path: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  {
    name: "maxDiagnostics.title",
    path: "/max",
    icon: <ChatIcon className="size-6" />,
  },
  {
    name: "Dashboard",
    path: "/",
    icon: <GridIcon className="size-6" />,
  },
  {
    name: "Feedback",
    path: "/feedback",
    icon: <ChatIcon className="size-6" />,
  },
  {
    name: "Referrals",
    path: "/referrals",
    icon: <UserMoneyIcon className="size-6" />,
  },
  {
    name: "Users",
    path: "/users",
    icon: <MultiUserIcon className="size-6" />,
  },
];

const accountItems: NavItem[] = [
  {
    name: "Profile",
    path: "/profile",
    icon: <UserCircleIcon className="size-6" />,
  },
];

const AppSidebar: React.FC = () => {
  const { t } = useTranslation();
  const {
    isExpanded,
    isHovered,
    isMobileOpen,
    isMobile,
    setIsHovered,
    setIsMobileOpen,
  } = useSidebar();
  const location = useLocation();

  const isActive = (path: string) =>
    path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(path);

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="mb-6 flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.name}>
          <Link
            to={item.path}
            onClick={() => setIsMobileOpen(false)}
            className={cn(
              "group menu-item",
              isActive(item.path) ? "menu-item-active" : "menu-item-inactive",
            )}
          >
            <span
              className={cn(
                isActive(item.path)
                  ? "menu-item-icon-active"
                  : "menu-item-icon-inactive",
              )}
            >
              {item.icon}
            </span>
            {(isExpanded || isHovered || isMobileOpen) && (
              <span>
                {item.name === "maxDiagnostics.title"
                  ? t(item.name)
                  : item.name}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <aside
      inert={isMobile && !isMobileOpen}
      className={cn(
        "fixed inset-s-0 top-0 z-50 flex h-screen flex-col border-e border-gray-200 bg-white px-5 text-gray-900 transition-all duration-300 ease-in-out xl:translate-x-0 xl:rtl:translate-x-0 dark:border-gray-800 dark:bg-gray-900",
        isExpanded || isMobileOpen ? "w-72.5" : isHovered ? "w-72.5" : "w-22.5",
        isMobileOpen
          ? "translate-x-0"
          : "-translate-x-full rtl:translate-x-full",
      )}
      onMouseEnter={() => !isMobile && !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          "flex py-8",
          !isExpanded && !isHovered ? "xl:justify-center" : "justify-start",
        )}
      >
        <Link to="/" aria-label="Grademaxxing admin home">
          {isExpanded || isHovered || isMobileOpen ? (
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
                G
              </span>
              <div>
                <p className="text-lg leading-tight font-semibold text-gray-900 dark:text-white">
                  Grademaxxing
                </p>
                <p className="text-theme-xs text-gray-400">Admin console</p>
              </div>
            </div>
          ) : (
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
              G
            </span>
          )}
        </Link>
      </div>

      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 flex text-xs leading-5 text-gray-400 uppercase ${
                  !isExpanded && !isHovered
                    ? "xl:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Menu"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(navItems)}
            </div>

            <div>
              <h2
                className={`mb-4 flex text-xs leading-5 text-gray-400 uppercase ${
                  !isExpanded && !isHovered
                    ? "xl:justify-center"
                    : "justify-start"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Account"
                ) : (
                  <HorizontaLDots className="size-6" />
                )}
              </h2>
              {renderMenuItems(accountItems)}
            </div>
          </div>
        </nav>

        {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}
      </div>
    </aside>
  );
};

export default AppSidebar;
