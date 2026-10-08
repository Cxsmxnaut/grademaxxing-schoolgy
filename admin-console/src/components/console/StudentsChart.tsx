import RangeTabs from "@/components/console/RangeTabs";
import type { UsageRangeDays, UsageSummary } from "@/lib/api";
import { shortDate } from "@/lib/format";
import type { ApexOptions } from "apexcharts";
import ReactApexChart from "react-apexcharts";

const rangeOptions: Array<{ value: UsageRangeDays; label: string }> = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];

export default function StudentsChart({
  summary,
  range,
  onRangeChange,
}: {
  summary: UsageSummary | undefined;
  range: UsageRangeDays;
  onRangeChange: (range: UsageRangeDays) => void;
}) {
  const days = summary?.dailyUsage ?? [];
  const categories = days.map((day) => shortDate(day.date));

  const options: ApexOptions = {
    colors: ["#465fff", "#12b76a"],
    chart: {
      fontFamily: "Outfit, sans-serif",
      type: "area",
      height: 340,
      toolbar: { show: false },
    },
    dataLabels: { enabled: false },
    stroke: { curve: "smooth", width: [3, 3] },
    xaxis: {
      categories,
      axisBorder: { show: false },
      axisTicks: { show: false },
      tickPlacement: "on",
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      fontFamily: "Outfit",
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        formatter: (value: number) => String(Math.round(value)),
      },
    },
    grid: {
      yaxis: { lines: { show: true } },
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 0.2,
        opacityFrom: 0.35,
        opacityTo: 0.02,
        stops: [0, 90, 100],
      },
    },
    markers: { size: 0 },
    states: {
      hover: { filter: { type: "none" } },
      active: { filter: { type: "none" } },
    },
    tooltip: {
      x: { show: true },
      y: {
        formatter: (value: number) =>
          `${value} student${value === 1 ? "" : "s"}`,
      },
    },
  };

  const series = [
    {
      name: "Active students",
      data: days.map((day) => day.activeStudents),
    },
    {
      name: "New students",
      data: days.map((day) => day.newStudents),
    },
  ];

  return (
    <div className="min-w-0 rounded-2xl border border-gray-200 bg-white px-5 pt-5 pb-5 sm:px-6 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Daily student activity
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Protected, anonymous activity counts — no student records.
          </p>
        </div>
        <RangeTabs
          options={rangeOptions}
          value={range}
          onChange={onRangeChange}
          ariaLabel="Analytics range"
        />
      </div>
      <div className="mt-4">
        {summary ? (
          <ReactApexChart
            options={options}
            series={series}
            type="area"
            height={340}
          />
        ) : (
          <div
            className="h-[340px] animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"
            role="status"
            aria-label="Loading usage chart"
          />
        )}
      </div>
    </div>
  );
}
