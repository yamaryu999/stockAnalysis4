import { Suspense } from "react";
import { fetchPicks } from "@/lib/api";
import { t } from "@/lib/i18n";
import DashboardContent from "@/components/dashboard/dashboard-content";

const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

async function loadData(searchParams: Record<string, string | string[] | undefined>) {
  const date = typeof searchParams.date === "string" ? searchParams.date : DEFAULT_DATE;
  const minScore = typeof searchParams.minScore === "string" ? Number(searchParams.minScore) : undefined;
  const type = typeof searchParams.type === "string" ? searchParams.type : undefined;
  return fetchPicks({ date, minScore, type });
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const data = await loadData(searchParams);
  const effectiveDate = data.date;
  const requestedDate = data.requestedDate;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{t("dashboard.heading")}</h2>
        <p className="text-sm text-slate-400">{effectiveDate}</p>
      </div>
      <Suspense fallback={<div>Loading...</div>}>
        <DashboardContent
          initialData={data}
          initialFilters={{
            date: typeof searchParams.date === "string" ? searchParams.date : requestedDate,
            minScore:
              typeof searchParams.minScore === "string"
                ? Number(searchParams.minScore)
                : data.weights.minScore,
            type: typeof searchParams.type === "string" ? searchParams.type : undefined
          }}
        />
      </Suspense>
    </div>
  );
}
