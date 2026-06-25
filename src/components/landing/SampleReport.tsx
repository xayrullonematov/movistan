import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

const sampleRisks = [
  "Data consistency during order writes",
  "Release sequencing across checkout and payments",
  "Operational ownership for the new boundary",
];

const sampleSteps = [
  "Extract checkout orchestration behind an internal API",
  "Run dual-write verification for two release cycles",
  "Gate migration on p95 latency and rollback drills",
];

export default function SampleReport() {
  return (
    <section className="px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto grid max-w-6xl gap-5 sm:gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <div className="space-y-3 sm:space-y-4">
          <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-medium text-emerald-200">
            <ClipboardCheck size={16} />
            Example decision report
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-50 md:text-4xl">
            See the output before you start.
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-gray-300 sm:text-base">
            The debate turns agent arguments into a decision report: the recommendation,
            confidence, risks, tradeoffs, and next steps your team can review.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#34362f] bg-[#151712] shadow-lg shadow-black/20">
          <div className="border-b border-[#34362f] bg-[#10120f] px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                  Decision report
                </p>
                <h3 className="mt-1 text-base font-semibold text-gray-50 sm:text-xl">
                  Migrate checkout with a service boundary first
                </h3>
              </div>
              <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-green-600/60 bg-green-500/15 px-2.5 text-sm font-medium text-green-200">
                <CheckCircle2 size={15} />
                82% confidence
              </span>
            </div>
          </div>

          <div className="grid gap-0 sm:grid-cols-3">
            <div className="border-b border-gray-800 p-4 sm:border-b-0 sm:border-r sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-green-200 sm:mb-3">
                <ShieldCheck size={18} />
                <h4 className="text-sm font-semibold">Recommendation</h4>
              </div>
              <p className="line-clamp-3 text-sm leading-relaxed text-gray-300 sm:line-clamp-none">
                Create an internal checkout API, move orchestration first, and defer
                independent deployment until rollback and observability are proven.
              </p>
            </div>

            <div className="border-b border-gray-800 p-4 sm:border-b-0 sm:border-r sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-amber-200 sm:mb-3">
                <AlertTriangle size={18} />
                <h4 className="text-sm font-semibold">Top risks</h4>
              </div>
              <ul className="space-y-1.5 text-sm text-gray-300 sm:space-y-2">
                {sampleRisks.map((risk, index) => (
                  <li key={risk} className={`${index > 1 ? "hidden sm:flex" : "flex"} gap-2`}>
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                    <span>{risk}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 sm:p-5">
              <div className="mb-2 flex items-center gap-2 text-emerald-200 sm:mb-3">
                <ListChecks size={18} />
                <h4 className="text-sm font-semibold">Next steps</h4>
              </div>
              <ol className="space-y-1.5 text-sm text-gray-300 sm:space-y-2">
                {sampleSteps.map((step, index) => (
                  <li key={step} className={`${index > 1 ? "hidden sm:flex" : "flex"} gap-2`}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 text-xs text-emerald-200">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
