import { NpoName } from "#/components/npo-name";
import { MIN_INTR_TO_CREDIT } from "#/routes/platform/constants";
import { humanize } from "@/helpers/decimal";

interface Props {
  amount: number;
  shares: Record<string, number>;
  classes?: string;
}

export function Review({ classes = "", amount, shares }: Props) {
  return (
    <div
      className={`overflow-auto scrollbar-thin scrollbar-thumb-ring scrollbar-track-border ${classes} p-6`}
    >
      <table className="table">
        <thead>
          <tr>
            <th>Holder</th>
            <th>Share</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(shares)
            .filter(([, v]) => v > MIN_INTR_TO_CREDIT)
            .sort(([, a], [, b]) => b - a)
            .map(([npo, share]) => (
              <tr key={npo} className="text-sm">
                <td>
                  <NpoName id={npo} />
                </td>
                <td className="text-right">{humanize(share * 100)} %</td>
                <td className="text-right">${humanize(share * amount)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
