import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, Output } from "ai";
import { z } from "zod";

import { createLovableAiGatewayRunIdFetch } from "./ai-gateway.server";
import { verifyDraft, type AuditResult, type Draft } from "./verify";

const DraftSchema = z.object({
  lineItems: z
    .array(
      z.object({
        ref: z.string(),
        item: z.string(),
        qty: z.number(),
        unit: z.number(),
        amount: z.number(),
      }),
    )
    .describe("One entry per billable line, in document order."),
  subtotal: z.number(),
  taxLabel: z.string().describe("e.g. 'VAT 20%' or 'Tax 5%'. Empty string if none."),
  taxRate: z
    .number()
    .nullable()
    .describe("Decimal rate, e.g. 0.2 for 20%. Null when no rate is stated."),
  taxAmount: z.number(),
  grandTotal: z.number(),
  confidence: z.number().describe("0 to 1, your own confidence in this extraction."),
});

const SYSTEM = `You extract structured billing data from invoice text.

Rules:
- Transcribe what the document states. Report the subtotal, tax and grand total
  exactly as printed, even if they look inconsistent with the lines above.
- Do not silently repair arithmetic; a later pass handles that.
- Only include lines that actually appear in the document.
- Use plain numbers with no currency symbols or thousands separators.`;

export const auditInvoice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ text: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<AuditResult> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const runIdFetch = createLovableAiGatewayRunIdFetch();
    const lovable = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runIdFetch.fetch,
    });

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      system: SYSTEM,
      prompt: `Extract this invoice:\n\n${data.text}`,
      output: Output.object({ schema: DraftSchema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });

    const draft = (await result.output) as Draft;
    return verifyDraft(draft, data.text);
  });
