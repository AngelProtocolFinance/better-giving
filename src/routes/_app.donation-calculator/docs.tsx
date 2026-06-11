import { Info } from "lucide-react";
import { useState } from "react";
import { DrawerIcon } from "#/components/icon";

export function Docs({ classes = "" }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={`bg-card rounded shadow-sm p-6 ${classes}`}>
      <button
        type="button"
        className="flex items-center gap-x-4 w-full"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Info size={20} className="text-muted-fg" />
        <span className="text-lg sm:text-xl font-bold">
          Calculation Details
        </span>
        <DrawerIcon size={20} is_open={isExpanded} className="ml-auto" />
      </button>

      {isExpanded && (
        <div className="mt-8 space-y-8">
          <section>
            <h4 className="font-semibold mb-4">Better Giving Platform</h4>
            <ul className="space-y-4 list-disc pl-6">
              <li>
                Better Giving doesn't charge processing fees, but third-party
                services charge an average of 2% (no platform fees)
              </li>
              <li>
                80% of donors opt to cover processing fees (based on platform
                data)
              </li>
              <li>
                Better Giving accepts all donation types (credit cards, ACH,
                digital wallets, crypto, stocks, DAF)
              </li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-4">Donation Type Calculation</h4>
            <p className="mb-4">
              These are approximate percentages for U.S.-based nonprofits,
              annualized and projected for 2025 based on trends. Our
              calculations assume 50% of donors will not proceed to make a
              donation if their preferred donation method is unavailable.
            </p>
            <ul className="space-y-4 list-disc pl-6">
              <li>Credit card donations: 63% of total volume</li>
              <li>ACH/Bank Transfer donations: 10% of total volume</li>
              <li>Digital Wallet donations: 7% of total volume</li>
              <li>Cryptocurrency donations: 2% of total volume</li>
              <li>Stock donations: 6% of total volume</li>
              <li>DAF donations: 12% of total volume</li>
            </ul>
          </section>

          <section>
            <h4 className="font-semibold mb-4">Investment Returns</h4>
            <ul className="space-y-4 list-disc pl-6">
              <li>Savings Account: 4% annual yield</li>
              <li>Sustainability Fund: 20% average annual return</li>
              <li>Returns compound daily</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
