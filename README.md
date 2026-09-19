# Veridect — a tool that catches its own confident mistakes

**Narrow task:** extract line items, subtotal, tax and grand total from a pasted invoice.

**Failure it hunts:** a **broken calculation** — a stated or drafted total that does not
follow from the lines above it.

**How it works:**

1. **Draft pass** — an LLM (`openai/gpt-6-astra` via the Lovable AI Gateway) reads the
   invoice and returns structured JSON. It is instructed to transcribe the document's
   stated totals verbatim and *not* to silently repair anything.
2. **Second pass** — `src/lib/verify.ts` never asks a model anything. It re-derives every
   number from the extracted line items and runs five checks:
   - `qty x unit consistency` — re-multiplies each line
   - `no fabricated lines` — every item label must trace back to the source text
   - `line-sum integrity` — lines must sum to the subtotal
   - `tax recomputation` — subtotal x stated rate must equal the tax line
   - `total = subtotal + tax`
3. **Verdict** — `clean` (nothing found), `corrected` (arithmetic repaired, before/after
   shown), or `flagged` (something unrepairable, e.g. a fabricated line).

Tolerance is ±$0.011 so legitimate cent-rounding does not trip the check.
## Why I built it this way

I initially experimented with using an LLM for both the draft and verification passes. 
The verifier could sometimes accept a plausible but incorrect calculation, so I changed 
the design rather than trying to solve the problem only with a stronger prompt.

The final version uses the LLM for extracting invoice structure, while ordinary 
JavaScript code independently performs the arithmetic checks. This gives the second 
pass an independent signal that does not depend on another model agreeing with the first one.

## Run it

```bash
bun install
bun run dev        # http://localhost:8080
```

`LOVABLE_API_KEY` is provisioned automatically and is read server-side only, inside the
`createServerFn` handler in `src/lib/audit.functions.ts`.

In the UI: paste an invoice (or press a sample button) and hit **Run second pass**, or
press **Run all · 6 cases** to execute the whole test suite against the live pipeline.

## The headline catch — before and after

Case `plausible-wrong`. The invoice is headed "retainer reconciliation" and ends with a
clean, deliberate-looking `Grand total (rounded to retainer) $1,000.00`.

| | Grand total | Self-reported confidence |
|---|---|---|
| **Draft (LLM)** | **$1,000.00** | **1.00** |
| **After second pass** | **$998.81** | — |

```json
{
  "verdict": "corrected",
  "grandTotal": { "before": 1000, "after": 998.81 },
  "drift": -1.19,
  "draftConfidence": 1,
  "findings": [
    { "check": "qty x unit consistency", "status": "pass" },
    { "check": "no fabricated lines",    "status": "pass" },
    { "check": "line-sum integrity",     "status": "pass" },
    { "check": "tax recomputation",      "status": "pass" },
    { "check": "total = subtotal + tax", "status": "fixed" }
  ]
}
```

$951.25 + $47.56 = $998.81. The model reported certainty on a number that was $1.19 wrong
and looked *more* correct than the truth, because round numbers read as intentional.

## Test cases — run and recorded

Run on 2026-09-19 against the live pipeline. 6/6 matched expectation.

| # | Case | Should trip? | Expected | Actual | Δ total |
|---|---|---|---|---|---|
| 1 | `clean-invoice` — fully consistent document | no | `clean` | `clean` | 0.00 |
| 2 | `rounding-drift` — tax 8.5% of $99.50 = 8.4575 printed as $8.46 | no | `clean` | `clean` | 0.00 |
| 3 | `wrong-total` — subtotal and tax right, total says $178.00 | yes | `corrected` | `corrected` | −10.00 |
| 4 | `vat-mismatch` — VAT 20% of $275.00 printed as $42.00 | yes | `corrected` | `corrected` | +13.00 |
| 5 | `line-arithmetic` — line 02 says 4 × $18.50 = $76.00 | yes | `corrected` | `corrected` | −2.00 |
| 6 | `plausible-wrong` — confident round $1,000.00 retainer total | yes | `corrected` | `corrected` | −1.19 |

Cases 1 and 2 are the important negatives: case 2 in particular is a real cent-level
discrepancy that must **not** be reported, or the tool cries wolf on every invoice.

## Where the model failed me, and what I did about it

**1. It reported confidence 1.00 on a wrong number.** On case 6 the draft was certain.
Any design that gates the second pass on the model's own confidence would have shipped
$1,000.00 to the user. So the verifier runs unconditionally, on every request, and the
draft's confidence is displayed as data, never used as a control signal.

**2. It wanted to be helpful and quietly fix things.** Early runs had the draft pass
"correcting" the grand total on its own, which destroyed the evidence — there was no
before/after to show, and a wrong repair would have been invisible. I added an explicit
instruction to transcribe stated totals verbatim and leave arithmetic alone, so the draft
stays a faithful reading and the audit owns all repair.

**3. Asking a second LLM to check the first one is not a check.** My first instinct was a
second model pass to "review" the draft. It agreed with plausible-looking wrong answers.
The second pass is therefore pure deterministic verification in `src/lib/verify.ts`. 
The LLM is used for extracting structure from messy text, while the derived numbers 
are independently recalculated in code.

**4. Exact equality was too strict.** The first verifier flagged case 2, where $8.4575
is legitimately printed as $8.46. A tool that flags correct invoices gets ignored, so
comparisons use a ±$0.011 tolerance.
### Development experiments

I also tested several approaches while building the prototype:

- **Gemini API:** repeated `503 UNAVAILABLE` responses made development and testing difficult.
- **Ollama / Qwen 3B:** provided a local fallback, but inference was too slow for practical iteration.
- **Groq:** I experimented with structured JSON output and encountered JSON/schema validation issues.
- **Lovable AI Gateway:** I used the gateway for the final live LLM extraction pipeline so I could focus the implementation on the self-checking behaviour.
- **Deterministic verification:** after testing the LLM-based verification approach, I moved the arithmetic checks into `src/lib/verify.ts`.

These experiments changed the final architecture. The important lesson was that the part of the task that can be deterministically verified should not depend on another LLM's judgement.

**Known limit:** the `no fabricated lines` check is a word-level containment test against
the source. It catches an invented line item, but not a line that is real with an invented
amount — that one is caught only indirectly, via the sum checks.
