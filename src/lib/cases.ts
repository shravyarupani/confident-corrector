import type { Verdict } from "./verify";

export type TestCase = {
  id: string;
  label: string;
  note: string;
  expected: Verdict;
  text: string;
};

export const TEST_CASES: TestCase[] = [
  {
    id: "clean-invoice",
    label: "clean-invoice",
    note: "Every number in the document is internally consistent. Must not trip.",
    expected: "clean",
    text: `INV-2041 · Meridian Supply Co.
01  Widget, 4 x $18.50  =  $74.00
02  Bracket, 2 x $9.75  =  $19.50
03  Cable, 1 x $22.00   =  $22.00
Subtotal                    $115.50
VAT 8%                      $9.24
Grand total                 $124.74`,
  },
  {
    id: "rounding-drift",
    label: "rounding-drift",
    note: "Tax is 8.5% of $99.50 = 8.4575, stated as $8.46. Legitimate rounding, must not trip.",
    expected: "clean",
    text: `INV-2044 · Meridian Freight
01  Handling, 1 x $42.00        = $42.00
02  Fuel surcharge, 1 x $18.50  = $18.50
03  Storage, 1 x $11.25         = $11.25
04  Expedite, 1 x $27.75        = $27.75
Subtotal                          $99.50
Tax 8.5%                          $8.46
TOTAL                             $107.96`,
  },
  {
    id: "wrong-total",
    label: "wrong-total",
    note: "Subtotal and tax are right, the stated grand total is not.",
    expected: "corrected",
    text: `INV-2051 · Northgate Tooling
01  Hex driver set, 3 x $24.00 = $72.00
02  Torque wrench, 1 x $88.00  = $88.00
Subtotal                         $160.00
Tax 5%                           $8.00
Grand total                      $178.00`,
  },
  {
    id: "vat-mismatch",
    label: "vat-mismatch",
    note: "VAT line is computed off the wrong base; total inherits the error.",
    expected: "corrected",
    text: `INV-2058 · Calder Print Works
01  Poster run, 500 x $0.42 = $210.00
02  Setup fee, 1 x $65.00   = $65.00
Subtotal                      $275.00
VAT 20%                       $42.00
Grand total                   $317.00`,
  },
  {
    id: "line-arithmetic",
    label: "line-arithmetic",
    note: "A single line item multiplies incorrectly; everything downstream is wrong.",
    expected: "corrected",
    text: `INV-2063 · Ashby Components
01  Gasket, 6 x $7.30   = $43.80
02  Spindle, 4 x $18.50 = $76.00
03  Shim pack, 2 x $5.00 = $10.00
Subtotal                  $129.80
Tax 0%                    $0.00
Grand total               $129.80`,
  },
  {
    id: "plausible-wrong",
    label: "plausible-wrong",
    note: "THE HARD ONE. A suspiciously round $1,000.00 total that looks deliberate and correct.",
    expected: "corrected",
    text: `INV-2070 · Halverson Studio — retainer reconciliation
01  Discovery workshop, 2 x $187.50 = $375.00
02  Design sprint, 1 x $420.00      = $420.00
03  Revision block, 5 x $31.25      = $156.25
Subtotal                              $951.25
Tax 5%                                $47.56
Grand total (rounded to retainer)     $1,000.00`,
  },
];
