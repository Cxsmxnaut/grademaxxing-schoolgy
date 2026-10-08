import MetricCard from "@/components/console/MetricCard";
import FeedbackBreakdown from "@/components/console/FeedbackBreakdown";
import RecentFeedback from "@/components/console/RecentFeedback";
import StudentsChart from "@/components/console/StudentsChart";
import Button from "@/components/ui/button/Button";
import PageMeta from "@/components/common/PageMeta";
import { useAuth } from "@/context/AuthContext";
import {
  adminApi,
  ApiError,
  type FeedbackItem,
  type UsageRangeDays,
  type UsageSummary,
} from "@/lib/api";
import { dateTime, percentDelta, relativeTime } from "@/lib/format";
import {
  BoxIconLine,
  GroupIcon,
  RegenerateIcon,
  ShootingStarIcon,
  UserAltIcon,
} from "@/icons";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

export default function Dashboard() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rangeParam = Number(searchParams.get("range"));
  const range: UsageRangeDays =
    rangeParam === 7 || rangeParam === 90 ? rangeParam : 30;

  const [summary, setSummary] = useState<UsageSummary>();
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [health, setHealth] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>();

  const load = useCallback(
    async (nextRange: UsageRangeDays) => {
      setLoading(true);
      setMessage(undefined);
      try {
        const [usage, feedbackResult, healthResult] = await Promise.all([
          adminApi.usage(nextRange),
          adminApi.feedback(),
          adminApi.health().catch(() => ({ status: "unreachable" })),
        ]);
        setSummary(usage);
        setFeedback(feedbackResult.items);
        setHealth(healthResult.status);
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.set("range", String(nextRange));
            return next;
          },
          { replace: true },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await refresh();
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to load dashboard data.",
        );
      } finally {
        setLoading(false);
      }
    },
    [refresh, setSearchParams],
  );

  useEffect(() => {
    void load(range);
    // Reload when the range changes.
  }, [load, range]);

  const activeDelta = summary
    ? percentDelta(summary.activeStudents, summary.previousActiveStudents)
    : undefined;
  const newDelta = summary
    ? percentDelta(summary.newStudents, summary.previousNewStudents)
    : undefined;

  return (
    <>
      <PageMeta
        title="Grademaxxing Admin — Operations"
        description="Private Grademaxxing operations console: usage analytics, feedback, and referrals."
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Operations
            </p>
            <h1 className="mt-1 text-title-xl font-semibold text-gray-800 dark:text-white/90">
              Product overview
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Real usage signals, without student records. Generated{" "}
              {summary ? dateTime(summary.generatedAt) : "—"}.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load(range)}
            startIcon={
              <RegenerateIcon
                className={`size-5 ${loading ? "animate-spin" : ""}`}
              />
            }
          >
            Refresh
          </Button>
        </div>

        {message && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
          >
            {message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Total students"
            value={summary?.uniqueStudents ?? "—"}
            hint={
              summary?.trackingStartedAt
                ? `Tracking since ${dateTime(summary.trackingStartedAt)}`
                : "Protected keys only"
            }
            icon={<GroupIcon className="size-6" />}
          />
          <MetricCard
            label={`Active students (${range}d)`}
            value={summary?.activeStudents ?? "—"}
            delta={activeDelta}
            trend={
              summary && summary.activeStudents >= summary.previousActiveStudents
                ? "up"
                : "down"
            }
            hint={`Previous period: ${summary?.previousActiveStudents ?? "—"}`}
            icon={<UserAltIcon className="size-6" />}
          />
          <MetricCard
            label={`New students (${range}d)`}
            value={summary?.newStudents ?? "—"}
            delta={newDelta}
            trend={
              summary && summary.newStudents >= summary.previousNewStudents
                ? "up"
                : "down"
            }
            hint={`Previous period: ${summary?.previousNewStudents ?? "—"}`}
            icon={<ShootingStarIcon className="size-6" />}
          />
          <MetricCard
            label="Active today"
            value={summary?.activeToday ?? "—"}
            hint={`Last activity ${relativeTime(summary?.lastActivityAt)}`}
            icon={<BoxIconLine className="size-6" />}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <StudentsChart
            summary={summary}
            range={range}
            onRangeChange={(next) => void load(next)}
          />
          <FeedbackBreakdown
            items={feedback}
            onSelect={(status) => navigate(`/feedback?status=${status}`)}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="min-w-0 xl:col-span-2">
            <RecentFeedback
              items={feedback}
              onOpen={(item) => navigate(`/feedback?item=${item.id}`)}
            />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
              At a glance
            </h3>
            <dl className="mt-4 space-y-4">
              <div>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Returning students (all-time)
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {summary?.returningStudents ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Returning students ({range}d)
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {summary?.returningStudentsInRange ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Protected user registry
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-800 dark:text-white/90">
                  {summary?.users.length ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  API health
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-white/90">
                  <span
                    className={`size-2.5 rounded-full ${
                      health === "ok"
                        ? "bg-success-500"
                        : health === undefined
                          ? "bg-gray-300 dark:bg-gray-600"
                          : "bg-error-500"
                    }`}
                  />
                  {health ?? "checking…"}
                </dd>
              </div>
              <div>
                <dt className="text-theme-xs text-gray-500 dark:text-gray-400">
                  Last activity
                </dt>
                <dd className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {dateTime(summary?.lastActivityAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
