import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

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
    ],
  }),
  component: Index,
});

type SuiteRow = {
  id: string;
  label: string;
  expected: Verdict;
  actual: Verdict | "…" | "err";
  drift: number;
};

const VERDICT_TONE: Record<Verdict, string> = {
  clean: "bg-ok/15 text-ok",
  corrected: "bg-accent/15 text-accent",
  flagged: "bg-warn/15 text-warn",
};

function Index() {
  const run = useServerFn(auditInvoice);
  const [text, setText] = useState(TEST_CASES[0]!.text);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suite, setSuite] = useState<SuiteRow[]>([]);
  const [suiteBusy, setSuiteBusy] = useState(false);
  const [runNo, setRunNo] = useState(416);

  async function audit(source: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await run({ data: { text: source } });
      setResult(r);
      setRunNo((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The audit run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    setSuiteBusy(true);
    setSuite(
      TEST_CASES.map((c) => ({
        id: c.id,
        label: c.label,
        expected: c.expected,
        actual: "…" as const,
        drift: 0,
      })),
    );
    for (const c of TEST_CASES) {
      try {
        const r = await run({ data: { text: c.text } });
        setSuite((prev) =>
          prev.map((row) =>
            row.id === c.id ? { ...row, actual: r.verdict, drift: r.drift } : row,
          ),
        );
      } catch {
        setSuite((prev) =>
          prev.map((row) => (row.id === c.id ? { ...row, actual: "err" as const } : row)),
        );
      }
    }
    setSuiteBusy(false);
  }

  const fixedCount = result?.findings.filter((f) => f.status !== "pass").length ?? 0;
  const needleRest = result
    ? `${Math.max(-40, Math.min(40, result.drift === 0 ? -34 : result.drift * -6))}deg`
    : "-34deg";

  return (
    <div className="min-h-screen bg-ink font-sans text-fg antialiased">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-md bg-accent font-mono text-sm font-semibold text-ink">
              V
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">Veridect</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Second-pass audit · v0.3
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-6 font-mono text-[11px] text-muted sm:flex">
            <span>invoice-audit</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-ok" />
              engine online
            </span>
            <span className="text-fg">run #{String(runNo).padStart(4, "0")}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1400px] gap-4 px-5 py-5 lg:grid-cols-[380px_1fr]">
        {/* INPUT RAIL */}
        <section className="animate-rise space-y-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                (a) input
              </span>
              <span className="font-mono text-[10px] text-muted">paste or load</span>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              className="h-56 w-full resize-none rounded-lg bg-ink/60 p-3 font-mono text-[12px] leading-relaxed text-fg outline-none focus:ring-1 focus:ring-accent/40"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {[TEST_CASES[0]!, TEST_CASES[2]!, TEST_CASES[5]!].map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => setText(c.text)}
                  className={
                    i === 2
                      ? "rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] text-accent"
                      : "rounded-md border border-line bg-panel-2 px-3 py-2 font-mono text-[11px] text-muted transition-colors hover:text-fg"
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => audit(text)}
              disabled={busy || suiteBusy}
              className="mt-3 w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? "Auditing…" : "Run second pass"}
            </button>
            {error ? (
              <p className="mt-2 font-mono text-[11px] text-warn">{error}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-line bg-panel p-4">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              (b) test suite
            </span>
            <div className="mt-3 space-y-1.5">
              {TEST_CASES.map((c) => {
                const row = suite.find((r) => r.id === c.id);
                const actual = row?.actual;
                const ok = actual === c.expected;
                const tone =
                  !actual || actual === "…"
                    ? "text-muted"
                    : actual === "err"
                      ? "text-warn"
                      : ok
                        ? "text-ok"
                        : "text-warn";
                return (
                  <button
                    key={c.id}
                    onClick={() => setText(c.text)}
                    title={c.note}
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition-colors hover:bg-panel-2"
                  >
                    <span className="font-mono text-[12px]">{c.label}</span>
                    <span className={`font-mono text-[10px] ${tone}`}>
                      exp {c.expected.toUpperCase()} · got{" "}
                      {(actual ?? "—").toString().toUpperCase()}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={runSuite}
              disabled={busy || suiteBusy}
              className="mt-3 w-full rounded-lg border border-line bg-panel-2 py-2 font-mono text-[12px] text-fg transition-colors hover:bg-line/40 disabled:opacity-50"
            >
              {suiteBusy ? "Running…" : `Run all · ${TEST_CASES.length} cases`}
            </button>
          </div>
        </section>

        {/* RESULT COLUMN */}
        <section className="space-y-4">
          {result ? (
            <>
              <div className="animate-rise rounded-xl border border-line bg-panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`animate-snap rounded-md px-3 py-1.5 font-mono text-[12px] font-semibold uppercase tracking-[0.14em] ${VERDICT_TONE[result.verdict]}`}
                    >
                      {result.verdict}
                    </span>
                    <span className="font-mono text-[11px] text-muted">
                      draft → audit ·{" "}
                      {fixedCount === 0
                        ? "no discrepancies"
                        : `${fixedCount} discrepanc${fixedCount === 1 ? "y" : "ies"} caught`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-40 overflow-hidden rounded-md border border-line bg-ink/50">
                      <div className="absolute inset-x-0 top-1/2 h-px bg-line/60" />
                      <div className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line" />
                      <div
                        key={runNo}
                        style={{ ["--needle-rest" as string]: needleRest }}
                        className="animate-needle absolute bottom-0 left-1/2 h-10 w-0.5 origin-bottom bg-accent"
                      />
                    </div>
                    <div className="font-mono text-[10px] leading-tight text-muted">
                      drift
                      <br />
                      <span className={result.drift === 0 ? "text-ok" : "text-accent"}>
                        {result.drift > 0 ? "+" : ""}
                        {result.drift.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                      line items
                    </span>
                    <table className="mt-2 w-full font-mono text-[12px]">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="pb-1 font-medium">ref</th>
                          <th className="pb-1 font-medium">item</th>
                          <th className="pb-1 text-right font-medium">qty</th>
                          <th className="pb-1 text-right font-medium">unit</th>
                          <th className="pb-1 text-right font-medium">amount</th>
                        </tr>
                      </thead>
                      <tbody className="text-fg">
                        {result.final.lineItems.map((li, i) => {
                          const before = result.draft.lineItems[i]?.amount;
                          const changed = before !== undefined && before !== li.amount;
                          return (
                            <tr key={`${li.ref}-${i}`} className="border-t border-line/50">
                              <td className="py-1.5 text-muted">{li.ref}</td>
                              <td>{li.item}</td>
                              <td className="text-right">{li.qty}</td>
                              <td className="text-right">{money(li.unit)}</td>
                              <td className="text-right">
                                {changed ? (
                                  <>
                                    <span className="text-muted line-through decoration-accent/70">
                                      {money(before!)}
                                    </span>{" "}
                                    <span className="text-accent">{money(li.amount)}</span>
                                  </>
                                ) : (
                                  money(li.amount)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t border-line/50">
                          <td className="py-1.5 text-muted">—</td>
                          <td className="text-muted">Subtotal</td>
                          <td />
                          <td />
                          <td className="text-right">{money(result.final.subtotal)}</td>
                        </tr>
                        <tr className="border-t border-line/50">
                          <td className="py-1.5 text-muted">—</td>
                          <td className="text-muted">
                            {result.final.taxLabel || "Tax"}
                          </td>
                          <td />
                          <td />
                          <td className="text-right">{money(result.final.taxAmount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 md:w-56">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                      grand total
                    </span>
                    <div className="mt-1 font-mono text-2xl font-semibold">
                      {result.drift !== 0 ? (
                        <>
                          <span className="text-muted line-through decoration-accent/70">
                            {money(result.draft.grandTotal)}
                          </span>{" "}
                          <span className="animate-xfade text-accent">
                            {money(result.final.grandTotal)}
                          </span>
                        </>
                      ) : (
                        <span className="text-ok">{money(result.final.grandTotal)}</span>
                      )}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted">
                      {result.drift !== 0
                        ? "before → after"
                        : `draft agreed · self-reported confidence ${result.draft.confidence.toFixed(2)}`}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-line bg-panel p-5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                    check findings
                  </span>
                  <div className="mt-3 space-y-1">
                    {result.findings.map((f, i) => (
                      <div
                        key={f.check}
                        className="animate-rise rounded-md px-2 py-2"
                        style={{ animationDelay: `${0.12 + i * 0.08}s` }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-[12px]">{f.check}</span>
                          <span
                            className={`shrink-0 font-mono text-[10px] ${
                              f.status === "pass"
                                ? "text-ok"
                                : f.status === "fixed"
                                  ? "text-accent"
                                  : "text-warn"
                            }`}
                          >
                            {f.status === "pass"
                              ? "PASS"
                              : f.status === "fixed"
                                ? "FAIL → fixed"
                                : "FLAG"}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-muted">
                          {f.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-line bg-panel p-5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                      raw output
                    </span>
                    <span className="rounded border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
                      JSON
                    </span>
                  </div>
                  <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-ink/60 p-3 font-mono text-[11px] leading-relaxed text-fg">
                    {JSON.stringify(
                      {
                        verdict: result.verdict,
                        grandTotal: {
                          before: result.draft.grandTotal,
                          after: result.final.grandTotal,
                        },
                        drift: result.drift,
                        draftConfidence: result.draft.confidence,
                        findings: result.findings.map((f) => ({
                          check: f.check,
                          status: f.status,
                        })),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-line bg-panel p-8">
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                idle
              </span>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
                Paste an invoice and run the second pass. Veridect drafts the extraction
                with an LLM, then re-derives every line, the subtotal, the tax and the
                grand total from scratch. When the draft and the recomputation disagree,
                you see both numbers.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
