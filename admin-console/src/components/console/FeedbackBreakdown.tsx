import type { FeedbackItem, FeedbackStatus } from "@/lib/api";
import { feedbackStatuses } from "@/lib/api";
import { statusLabel } from "./StatusBadge";
import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";

const statusColors: Record<FeedbackStatus, string> = {
  new: "#465fff",
  reviewing: "#f79009",
  planned: "#0ba5ec",
  resolved: "#12b76a",
  dismissed: "#667085",
};

export default function FeedbackBreakdown({
  items,
  onSelect,
}: {
  items: FeedbackItem[];
  onSelect?: (status: FeedbackStatus) => void;
}) {
  const counts = feedbackStatuses.map(
    (status) => items.filter((item) => item.status === status).length,
  );
  const total = items.length;

  const options: ApexOptions = {
    colors: feedbackStatuses.map((status) => statusColors[status]),
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "donut",
      height: 280,
      events: {
        dataPointSelection: (_event, _config, details) => {
          const index = details?.dataPointIndex ?? -1;
          if (onSelect && index >= 0) onSelect(feedbackStatuses[index]);
        },
      },
    },
    labels: feedbackStatuses.map(statusLabel),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { show: true, fontFamily: "Outfit" },
            value: {
              show: true,
              fontSize: "22px",
              fontWeight: 600,
              formatter: (value: string) => value,
            },
            total: {
              show: true,
              label: "Total",
              formatter: () => String(total),
            },
          },
        },
      },
    },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
  };

  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white px-5 pt-5 pb-5 sm:px-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
        Feedback pipeline
      </h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Click a slice to filter the inbox.
      </p>
      {total > 0 ? (
        <ReactApexChart
          options={options}
          series={counts}
          type="donut"
          height={280}
        />
      ) : (
        <p className="mt-8 text-center text-sm text-gray-400 dark:text-gray-500">
          No feedback yet.
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {feedbackStatuses.map((status, index) => (
          <li key={status}>
            <button
              onClick={() => onSelect?.(status)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-theme-sm transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: statusColors[status] }}
                />
                {statusLabel(status)}
              </span>
              <span className="font-medium text-gray-800 dark:text-white/90">
                {counts[index]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
