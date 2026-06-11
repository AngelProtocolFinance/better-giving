import { NpoName } from "#/components/npo-name";
import { humanize } from "@/helpers/decimal";

interface Props {
  amount: number;
  per_npo_credit_usd: Record<string, number>;
  classes?: string;
}

export function Review({ classes = "", amount, per_npo_credit_usd }: Props) {
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
          {Object.entries(per_npo_credit_usd)
            .sort(([, a], [, b]) => b - a)
            .map(([npo, npo_usd]) => (
              <tr key={npo} className="text-sm">
                <td>
                  <NpoName id={npo} />
                </td>
                <td className="text-right">
                  {humanize((npo_usd / amount) * 100)} %
                </td>
                <td className="text-right">${humanize(npo_usd)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
