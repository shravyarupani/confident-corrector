import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { auditInvoice } from "@/lib/audit.functions";
import { TEST_CASES } from "@/lib/cases";
import { money, type AuditResult, type Verdict } from "@/lib/verify";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Veridect — second-pass invoice audit" },
      {
        name: "description",
        content:
          "Veridect drafts an invoice extraction with an LLM, then re-derives every number to catch confidently wrong totals before anyone sees them.",
      },
      { property: "og:title", content: "Veridect — second-pass invoice audit" },
      {
        property: "og:description",
        content:
          "An LLM drafts the extraction, a deterministic second pass recomputes it and shows the before and after.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type SuiteRow = {
  id: string;
  expected: Verdict;
  actual: Verdict | "…" | "err";
  drift: number;
};

const VERDICT_TONE: Record<Verdict, string> = {
  clean: "border-ok/50 bg-ok/15 text-ok",
  corrected: "border-accent/50 bg-accent/15 text-accent",
  flagged: "border-warn/50 bg-warn/15 text-warn",
};

const samples = [TEST_CASES[0], TEST_CASES[2], TEST_CASES[5]].filter(
  (item): item is (typeof TEST_CASES)[number] => Boolean(item),
);

function Index() {
  const run = useServerFn(auditInvoice);
  const firstCase = TEST_CASES[0];
  const [text, setText] = useState(firstCase?.text ?? "");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suite, setSuite] = useState<SuiteRow[]>([]);
  const [suiteBusy, setSuiteBusy] = useState(false);

  async function audit(source: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await run({ data: { text: source } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The audit run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    setSuiteBusy(true);
    setSuite(
      TEST_CASES.map((testCase) => ({
        id: testCase.id,
        expected: testCase.expected,
        actual: "…" as const,
        drift: 0,
      })),
    );
    for (const testCase of TEST_CASES) {
      try {
        const testResult = await run({ data: { text: testCase.text } });
        setSuite((current) =>
          current.map((row) =>
            row.id === testCase.id
              ? { ...row, actual: testResult.verdict, drift: testResult.drift }
              : row,
          ),
        );
      } catch {
        setSuite((current) =>
          current.map((row) =>
            row.id === testCase.id ? { ...row, actual: "err" as const } : row,
          ),
        );
      }
    }
    setSuiteBusy(false);
  }

  const issueCount = result?.findings.filter((finding) => finding.status !== "pass").length ?? 0;

  return (
    <main className="min-h-screen bg-ink px-4 py-10 font-sans text-fg sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-[980px]">
        <header className="mb-8 animate-rise">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            Two-pass verifier
          </p>
          <h1 className="mt-2 text-4xl font-bold leading-none sm:text-5xl">Veridect</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
            Paste an invoice. Pass 1 extracts a fast, confident answer. Pass 2 recomputes
            every amount before you see it—then rewrites or flags anything that does not add up.
          </p>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="border border-line bg-panel p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-heading">
                Source invoice
              </h2>
              <span className="font-mono text-[10px] text-muted">paste or load a case</span>
            </div>
            <textarea
              aria-label="Source invoice"
              value={text}
              onChange={(event) => setText(event.target.value)}
              spellCheck={false}
              className="h-64 w-full resize-none border border-line bg-field p-3 font-mono text-xs leading-5 text-fg outline-none transition-colors focus:border-accent"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {samples.map((testCase) => (
                <Button
                  key={testCase.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setText(testCase.text)}
                  className="h-7 rounded-none border-line bg-field px-2 font-mono text-[10px] text-muted shadow-none hover:bg-panel-2 hover:text-fg"
                >
                  {testCase.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              onClick={() => audit(text)}
              disabled={busy || suiteBusy || text.trim().length === 0}
              className="mt-3 h-11 w-full rounded-none bg-accent font-mono text-xs font-semibold uppercase tracking-[0.12em] text-accent-foreground shadow-none hover:bg-accent/90"
            >
              {busy ? "Drafting & verifying…" : "Draft & verify"}
            </Button>
            {error ? <p className="mt-2 font-mono text-[11px] text-warn">{error}</p> : null}
          </div>

          <div className="border border-line bg-panel p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-heading">
                Test cases
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={runSuite}
                disabled={busy || suiteBusy}
                className="h-7 rounded-none px-2 font-mono text-[10px] text-muted hover:bg-panel-2 hover:text-fg"
              >
                {suiteBusy ? "Running…" : "Run all"}
              </Button>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {TEST_CASES.map((testCase) => {
                const row = suite.find((item) => item.id === testCase.id);
                const actual = row?.actual;
                const passed = actual === testCase.expected;
                const status = !actual
                  ? testCase.expected === "clean"
                    ? "clean"
                    : "trips"
                  : actual === "…"
                    ? "running"
                    : actual === "err"
                      ? "error"
                      : passed
                        ? actual
                        : "mismatch";
                const statusTone =
                  status === "clean"
                    ? "border-ok/50 bg-ok/15 text-ok"
                    : status === "running"
                      ? "border-heading/50 bg-heading/10 text-heading"
                      : "border-warn/50 bg-warn/15 text-warn";
                return (
                  <button
                    type="button"
                    key={testCase.id}
                    onClick={() => setText(testCase.text)}
                    className="group flex w-full items-start justify-between gap-4 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-fg group-hover:text-heading">
                        {testCase.label}
                      </span>
                      <span className="mt-1 block text-[11px] leading-4 text-muted">
                        {testCase.note}
                        {row && row.drift !== 0 ? ` Difference: ${money(row.drift)}.` : ""}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 shrink-0 border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${statusTone}`}
                    >
                      {status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {result ? (
          <section className="mt-8 animate-rise" aria-live="polite">
            <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-line pb-3">
              <h2 className="text-xl font-bold">Result</h2>
              <span
                className={`border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] ${VERDICT_TONE[result.verdict]}`}
              >
                {result.verdict}
              </span>
              <span className="font-mono text-[10px] text-muted">
                {issueCount} {issueCount === 1 ? "issue" : "issues"} found
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="p-4 sm:p-5">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  Before — pass 1 draft
                </h3>
                <div className="mt-4 space-y-2 font-mono text-xs leading-5">
                  {result.draft.lineItems.map((line, index) => (
                    <div key={`${line.ref}-${index}`} className="flex justify-between gap-4">
                      <span className="text-muted">{line.item}</span>
                      <span>{money(line.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-line pt-2">
                    <span>Subtotal</span>
                    <span>{money(result.draft.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>{result.draft.taxLabel || "Tax"}</span>
                    <span>{money(result.draft.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 text-base font-semibold">
                    <span>Grand total</span>
                    <span className={result.drift !== 0 ? "text-warn line-through" : "text-ok"}>
                      {money(result.draft.grandTotal)}
                    </span>
                  </div>
                </div>
                <p className="mt-4 font-mono text-[10px] text-muted">
                  Model confidence: {result.draft.confidence.toFixed(2)}
                </p>
              </article>

              <article className="border border-ok/60 bg-ok/5 p-4 sm:p-5">
                <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-ok">
                  After — verified answer
                </h3>
                <div className="mt-4 space-y-2 font-mono text-xs leading-5">
                  {result.final.lineItems.map((line, index) => (
                    <div key={`${line.ref}-${index}`} className="flex justify-between gap-4">
                      <span className="text-muted">{line.item}</span>
                      <span>{money(line.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-4 border-t border-ok/30 pt-2">
                    <span>Subtotal</span>
                    <span>{money(result.final.subtotal)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>{result.final.taxLabel || "Tax"}</span>
                    <span>{money(result.final.taxAmount)}</span>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 text-base font-semibold text-ok">
                    <span>Grand total</span>
                    <span>{money(result.final.grandTotal)}</span>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-muted">
                  Recomputed from quantities, unit prices, subtotal, and tax—not from the printed total.
                </p>
              </article>
            </div>

            <div className="mt-6 border border-line bg-panel p-4 sm:p-5">
              <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-heading">
                What the check found
              </h3>
              <div className="mt-3 divide-y divide-line">
                {result.findings.map((finding) => (
                  <div key={finding.check} className="grid gap-2 py-3 sm:grid-cols-[145px_1fr]">
                    <div>
                      <span
                        className={`inline-block border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] ${
                          finding.status === "pass"
                            ? "border-ok/40 bg-ok/10 text-ok"
                            : finding.status === "fixed"
                              ? "border-warn/40 bg-warn/10 text-warn"
                              : "border-accent/40 bg-accent/10 text-accent"
                        }`}
                      >
                        {finding.status === "pass" ? "verified" : finding.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{finding.check}</p>
                      <p className="mt-1 font-mono text-[11px] leading-5 text-muted">{finding.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <details className="mt-4 border border-line bg-panel">
              <summary className="cursor-pointer px-4 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Structured JSON output
              </summary>
              <pre className="max-h-80 overflow-auto border-t border-line bg-field p-4 font-mono text-[11px] leading-5 text-fg">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </section>
        ) : (
          <p className="mt-8 border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            Ready for a source invoice
          </p>
        )}
      </div>
    </main>
  );
}