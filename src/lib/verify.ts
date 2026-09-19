/**
 * Second pass: a deterministic audit of the LLM's draft extraction.
 *
 * The draft pass is an LLM reading a messy invoice. It is confident and often
 * simply copies the stated grand total, even when that total does not follow
 * from the lines above it. This module never asks a model anything — it
 * recomputes every number from the extracted line items and compares.
 */

export type LineItem = {
  ref: string;
  item: string;
  qty: number;
  unit: number;
  amount: number;
};

export type Draft = {
  lineItems: LineItem[];
  subtotal: number;
  taxLabel: string;
  taxRate: number | null;
  taxAmount: number;
  grandTotal: number;
  confidence: number;
};

export type FindingStatus = "pass" | "fixed" | "flag";

export type Finding = {
  check: string;
  status: FindingStatus;
  detail: string;
};

export type Verdict = "clean" | "corrected" | "flagged";

export type AuditResult = {
  verdict: Verdict;
  draft: Draft;
  final: Draft;
  findings: Finding[];
  drift: number;
};

const TOLERANCE = 0.011;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const off = (a: number, b: number) => Math.abs(a - b) > TOLERANCE;

export const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Loose containment test used by the fabricated-line check. */
function mentionedIn(source: string, label: string) {
  const haystack = source.toLowerCase().replace(/[^a-z0-9 ]+/g, " ");
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return true;
  return words.some((w) => haystack.includes(w));
}

export function verifyDraft(draft: Draft, sourceText: string): AuditResult {
  const findings: Finding[] = [];

  // 1. qty x unit consistency (repairable)
  const lineItems: LineItem[] = draft.lineItems.map((li) => {
    const expected = round2(li.qty * li.unit);
    if (li.qty > 0 && off(expected, li.amount)) {
      return { ...li, amount: expected };
    }
    return li;
  });
  const lineFixes = draft.lineItems.filter(
    (li, i) => li.amount !== lineItems[i]!.amount,
  );
  findings.push(
    lineFixes.length
      ? {
          check: "qty x unit consistency",
          status: "fixed",
          detail: lineFixes
            .map(
              (li, i) =>
                `${li.item}: ${money(li.amount)} -> ${money(
                  lineItems[draft.lineItems.indexOf(li)]?.amount ?? li.amount,
                )}${i < lineFixes.length - 1 ? ";" : ""}`,
            )
            .join(" "),
        }
      : {
          check: "qty x unit consistency",
          status: "pass",
          detail: `${lineItems.length} lines re-multiplied, all match`,
        },
  );

  // 2. fabricated lines (not repairable -> flag)
  const fabricated = lineItems.filter((li) => !mentionedIn(sourceText, li.item));
  findings.push(
    fabricated.length
      ? {
          check: "no fabricated lines",
          status: "flag",
          detail: `not present in source: ${fabricated.map((f) => f.item).join(", ")}`,
        }
      : {
          check: "no fabricated lines",
          status: "pass",
          detail: "every line traced back to the source text",
        },
  );

  // 3. line-sum integrity (repairable)
  const subtotal = round2(lineItems.reduce((s, li) => s + li.amount, 0));
  const subtotalBroken = off(subtotal, draft.subtotal);
  findings.push(
    subtotalBroken
      ? {
          check: "line-sum integrity",
          status: "fixed",
          detail: `subtotal ${money(draft.subtotal)} -> ${money(subtotal)}`,
        }
      : {
          check: "line-sum integrity",
          status: "pass",
          detail: `lines sum to ${money(subtotal)}`,
        },
  );

  // 4. tax recomputation (repairable when a rate is stated)
  let taxAmount = draft.taxAmount;
  if (draft.taxRate !== null && draft.taxRate > 0) {
    const expected = round2(subtotal * draft.taxRate);
    if (off(expected, draft.taxAmount)) {
      taxAmount = expected;
      findings.push({
        check: "tax recomputation",
        status: "fixed",
        detail: `${money(subtotal)} x ${(draft.taxRate * 100).toFixed(2)}% = ${money(
          expected,
        )}, draft said ${money(draft.taxAmount)}`,
      });
    } else {
      findings.push({
        check: "tax recomputation",
        status: "pass",
        detail: `${money(draft.taxAmount)} matches ${(draft.taxRate * 100).toFixed(2)}% of subtotal`,
      });
    }
  } else {
    findings.push({
      check: "tax recomputation",
      status: "pass",
      detail: "no tax rate stated, nothing to recompute",
    });
  }

  // 5. grand total (repairable)
  const grandTotal = round2(subtotal + taxAmount);
  const totalBroken = off(grandTotal, draft.grandTotal);
  findings.push(
    totalBroken
      ? {
          check: "total = subtotal + tax",
          status: "fixed",
          detail: `${money(draft.grandTotal)} -> ${money(grandTotal)}`,
        }
      : {
          check: "total = subtotal + tax",
          status: "pass",
          detail: `${money(grandTotal)} confirmed`,
        },
  );

  const hasFlag = findings.some((f) => f.status === "flag");
  const hasFix = findings.some((f) => f.status === "fixed");

  return {
    verdict: hasFlag ? "flagged" : hasFix ? "corrected" : "clean",
    draft,
    final: {
      ...draft,
      lineItems,
      subtotal,
      taxAmount,
      grandTotal,
    },
    findings,
    drift: round2(grandTotal - draft.grandTotal),
  };
}
