import { SidebarProvider, useSidebar } from "@/context/SidebarContext";
import { cn } from "@/utils";
import { Outlet } from "react-router";
import AppHeader from "./AppHeader";
import AppSidebar from "./AppSidebar";
import Backdrop from "./Backdrop";

const LayoutContent: React.FC = () => {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen xl:flex">
      <AppSidebar />
      <Backdrop />

      <div
        className={cn(
          // Margin is only animated at xl (sidebar push); below xl the parent is
          // block-level, so a transitioning margin would briefly overflow the page.
          "flex-1 xl:transition-[margin] duration-300 ease-in-out",
          isExpanded || isHovered ? "xl:ms-72.5" : "xl:ms-22.5",
          isMobileOpen ? "ms-0" : "",
        )}
      >
        <AppHeader />
        <main className="mx-auto max-w-(--breakpoint-2xl) p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
