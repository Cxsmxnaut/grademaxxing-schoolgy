import type React from "react";

type MetricCardProps = {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  hint?: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
};

const trendStyles = {
  up: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500",
  down: "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500",
  flat: "bg-gray-100 text-gray-600 dark:bg-white/5 dark:text-gray-400",
};

export default function MetricCard({
  label,
  value,
  icon,
  hint,
  delta,
  trend = "flat",
}: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between">
        <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
          {icon}
        </div>
        {delta !== undefined && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-theme-xs font-medium ${trendStyles[trend]}`}
          >
            {delta}
          </span>
        )}
      </div>
      <div className="mt-4">
        <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
        <h4 className="mt-1 font-bold text-gray-800 text-title-sm dark:text-white/90">
          {value}
        </h4>
        {hint && (
          <p className="mt-1 text-theme-xs text-gray-400 dark:text-gray-500">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
