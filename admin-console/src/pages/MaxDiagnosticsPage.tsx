import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import PageMeta from "@/components/common/PageMeta";
import Button from "@/components/ui/button/Button";
import Badge from "@/components/ui/badge/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MetricCard from "@/components/console/MetricCard";
import { ChatIcon, AlertIcon, CheckCircleIcon, ClockIcon } from "@/icons";
import { useAuth } from "@/context/AuthContext";
import { adminApi, ApiError, type MaxDiagnosticSummary } from "@/lib/api";
import { dateTime } from "@/lib/format";

export default function MaxDiagnosticsPage() {
  const { t } = useTranslation();
  const { refresh } = useAuth();
  const [data, setData] = useState<MaxDiagnosticSummary>();
  const [issues, setIssues] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>();
  const [confirmClear, setConfirmClear] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);
  const load = useCallback(
    async (before?: string) => {
      currentRequest.current?.abort();
      const controller = new AbortController();
      currentRequest.current = controller;
      setBusy(true);
      try {
        const result = await adminApi.maxDiagnostics(
          before,
          issues,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setData((old) =>
          before && old
            ? { ...result, items: [...old.items, ...result.items] }
            : result,
        );
        setError("");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.status === 401) await refresh();
        else setError(t("maxDiagnostics.unavailable"));
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [issues, refresh, t],
  );
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void load();
    });
    return () => {
      disposed = true;
      currentRequest.current?.abort();
    };
  }, [load]);
  async function clear() {
    setBusy(true);
    try {
      await adminApi.clearMaxDiagnostics();
      setConfirmClear(false);
      await load();
    } catch {
      setError(t("maxDiagnostics.clearFailed"));
      setBusy(false);
    }
  }
  const metrics = [
    ["requests", data?.totals.requests ?? 0, ChatIcon],
    ["failed", data?.totals.failed ?? 0, AlertIcon],
    ["flagged", data?.totals.flagged ?? 0, ClockIcon],
    ["reported", data?.totals.reported ?? 0, CheckCircleIcon],
  ] as const;
  return (
    <>
      <PageMeta
        title={t("maxDiagnostics.pageTitle")}
        description={t("maxDiagnostics.description")}
      />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title-sm font-semibold text-gray-800 dark:text-white/90">
            {t("maxDiagnostics.title")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
            {t("maxDiagnostics.description")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void load()}
        >
          {t(busy ? "maxDiagnostics.loading" : "maxDiagnostics.refresh")}
        </Button>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([key, value, Icon]) => (
          <MetricCard
            key={key}
            label={t(`maxDiagnostics.${key}`)}
            value={value}
            icon={<Icon className="size-6" />}
          />
        ))}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 p-5 dark:border-gray-800">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={issues}
              onChange={(e) => {
                setData(undefined);
                setIssues(e.target.checked);
              }}
            />
            {t("maxDiagnostics.issuesOnly")}
          </label>
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">
            {t("maxDiagnostics.retention", { days: data?.retentionDays ?? 7 })}
          </span>
        </div>
        {error && (
          <div
            role="alert"
            className="m-5 rounded-lg bg-error-50 p-4 text-sm text-error-700 dark:bg-error-500/15 dark:text-error-400"
          >
            {error}
          </div>
        )}
        {!data && busy && (
          <p role="status" className="p-6 text-gray-500 dark:text-gray-400">
            {t("maxDiagnostics.loading")}
          </p>
        )}
        {data && data.items.length === 0 && (
          <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
            {t("maxDiagnostics.empty")}
          </p>
        )}
        {data && data.items.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {["request", "outcome", "provider", "latency", "details"].map(
                    (key) => (
                      <TableCell
                        key={key}
                        isHeader
                        className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400"
                      >
                        {t(`maxDiagnostics.${key}`)}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <Fragment key={item.id}>
                    <TableRow className="border-t border-gray-100 dark:border-gray-800">
                      <TableCell className="max-w-sm px-5 py-4 text-sm text-gray-800 dark:text-gray-200">
                        <div className="font-medium">
                          {t(`maxDiagnostics.topics.${item.topic}`, {
                            defaultValue: item.topic,
                          })}
                        </div>
                        <time className="text-theme-xs text-gray-500 dark:text-gray-400">
                          {dateTime(new Date(item.createdAt).toISOString())}
                        </time>
                        <p className="mt-1 line-clamp-2 text-theme-xs break-words text-gray-500 dark:text-gray-400">
                          {item.question ?? t("maxDiagnostics.notShared")}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <Badge
                          color={
                            item.status === "success"
                              ? "success"
                              : item.status === "running"
                                ? "info"
                                : "warning"
                          }
                        >
                          {t(`maxDiagnostics.statuses.${item.status}`)}
                        </Badge>
                        {item.reportedReason && (
                          <div className="mt-2 text-theme-xs text-error-600 dark:text-error-400">
                            {t("maxDiagnostics.studentReport")}:{" "}
                            {t(`maxDiagnostics.reasons.${item.reportedReason}`)}
                          </div>
                        )}
                        {item.flags.length > 0 && (
                          <p className="mt-1 text-theme-xs text-warning-600 dark:text-warning-400">
                            {item.flags
                              .map((flag) =>
                                t(`maxDiagnostics.flags.${flag}`, {
                                  defaultValue: flag,
                                }),
                              )
                              .join(" · ")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-xs text-gray-600 dark:text-gray-300">
                        <span>{item.provider ?? "—"}</span>
                        <p className="max-w-48 break-words text-gray-400">
                          {item.model}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4 text-theme-xs whitespace-nowrap text-gray-600 dark:text-gray-300">
                        <p>
                          {t("maxDiagnostics.milliseconds", {
                            value: item.durationMs,
                          })}
                        </p>
                        <p className="mt-1 text-gray-400">
                          {t("maxDiagnostics.firstToken")}:{" "}
                          {item.firstTokenMs === null
                            ? "—"
                            : t("maxDiagnostics.milliseconds", {
                                value: item.firstTokenMs,
                              })}
                        </p>
                      </TableCell>
                      <TableCell className="px-5 py-4">
                        <button
                          className="text-sm text-brand-600 underline underline-offset-4 dark:text-brand-400"
                          aria-expanded={selected === item.id}
                          onClick={() =>
                            setSelected(
                              selected === item.id ? undefined : item.id,
                            )
                          }
                        >
                          {t(
                            selected === item.id
                              ? "maxDiagnostics.hide"
                              : "maxDiagnostics.inspect",
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                    {selected === item.id && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="bg-gray-50 p-5 dark:bg-gray-900"
                        >
                          <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                            <p className="font-mono text-theme-xs break-all">
                              {t("maxDiagnostics.requestId")}: {item.id}
                            </p>
                            {item.question && (
                              <div>
                                <h2 className="font-semibold">
                                  {t("maxDiagnostics.sharedQuestion")}
                                </h2>
                                <p className="mt-1 break-words whitespace-pre-wrap">
                                  {item.question}
                                </p>
                              </div>
                            )}
                            <p>
                              {t("maxDiagnostics.responseMetrics", {
                                chars: item.outputChars,
                                frames: item.tokenFrames,
                              })}
                            </p>
                            {item.errorCode && (
                              <p>
                                {t("maxDiagnostics.errorCode")}:{" "}
                                <code>{item.errorCode}</code>
                              </p>
                            )}
                            <h2 className="font-semibold">
                              {t("maxDiagnostics.timeline")}
                            </h2>
                            <ol className="space-y-2">
                              {item.events.map((event, index) => (
                                <li
                                  key={index}
                                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-s border-gray-300 ps-4 dark:border-gray-700"
                                >
                                  <span className="font-mono text-theme-xs text-gray-400">
                                    +
                                    {t("maxDiagnostics.milliseconds", {
                                      value: event.ms,
                                    })}
                                  </span>
                                  <span>{event.name}</span>
                                  <span className="text-theme-xs">
                                    {t(
                                      `maxDiagnostics.eventOutcomes.${event.outcome}`,
                                      { defaultValue: event.outcome },
                                    )}
                                    {event.status
                                      ? ` · HTTP ${event.status}`
                                      : ""}
                                  </span>
                                  <span className="text-theme-xs text-gray-400">
                                    {event.model} ·{" "}
                                    {t("maxDiagnostics.milliseconds", {
                                      value: event.durationMs,
                                    })}
                                  </span>
                                </li>
                              ))}
                            </ol>
                            {item.events.length === 0 && (
                              <p className="text-gray-500">
                                {t("maxDiagnostics.noEvents")}
                              </p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {data?.nextBefore && (
          <div className="p-5">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void load(data.nextBefore ?? undefined)}
            >
              {t("maxDiagnostics.loadMore")}
            </Button>
          </div>
        )}
      </div>
      <p className="mt-4 text-theme-xs text-gray-500 dark:text-gray-400">
        {t("maxDiagnostics.limits")}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !data}
          onClick={() => (confirmClear ? void clear() : setConfirmClear(true))}
        >
          {t(
            confirmClear
              ? "maxDiagnostics.confirmClear"
              : "maxDiagnostics.clear",
          )}
        </Button>
        {confirmClear && (
          <button
            onClick={() => setConfirmClear(false)}
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            {t("maxDiagnostics.cancel")}
          </button>
        )}
      </div>
    </>
  );
}
