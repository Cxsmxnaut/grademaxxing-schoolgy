import GridShape from "@/components/common/GridShape";
import ThemeTogglerTwo from "@/components/common/ThemeTogglerTwo";
import React from "react";
import { Link } from "react-router";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-1 bg-white p-6 sm:p-0 dark:bg-gray-900">
      <div className="relative flex h-screen w-full flex-col justify-center sm:p-0 lg:flex-row dark:bg-gray-900">
        {children}
        <div className="hidden h-full w-full items-center bg-brand-950 lg:grid lg:w-1/2 dark:bg-white/5">
          <div className="relative z-1 flex items-center justify-center">
            <GridShape />

            <div className="flex max-w-xs flex-col items-center">
              <Link to="/" className="mb-4 block">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold text-white">
                    G
                  </span>
                  <span className="text-3xl font-semibold tracking-tight text-white">
                    Grademaxxing
                  </span>
                </div>
              </Link>

              <p className="text-center text-gray-400 dark:text-white/60">
                Operations console — usage signals, feedback, and growth, with
                zero student records.
              </p>
            </div>
          </div>
        </div>

        <div className="fixed inset-e-6 bottom-6 z-50 hidden sm:block">
          <ThemeTogglerTwo />
        </div>
      </div>
    </div>
  );
}
