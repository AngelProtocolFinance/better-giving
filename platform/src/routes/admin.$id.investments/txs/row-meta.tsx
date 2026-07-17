import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { mask_string } from "#/helpers/mask-string";
import type { IBalanceTx } from "@/balance-txs";

interface IRowMeta {
  icon: ReactNode;
  description: ReactNode;
}

interface IDescription {
  id: string;
  text: string;
}
export const Description = (props: IDescription) => {
  return (
    <p>
      {props.text}{" "}
      <span className="text-xs text-muted-fg">{mask_string(props.id, 4)}</span>
    </p>
  );
};

/** pov: investments */
export const row_meta = (data: IBalanceTx): IRowMeta => {
  // always positive
  if (data.account_other === "donation") {
    return {
      icon: <ArrowRight size={16} className="text-success" />,
      description: <Description text="Donation" id={data.account_other_id!} />,
    };
  }

  if (data.account_other === "dividend") {
    return {
      icon: <ArrowRight size={16} className="text-success" />,
      description: <Description text="Dividend" id={data.account_other_id!} />,
    };
  }
  // always negative
  if (data.account_other === "refund") {
    return {
      icon: <ArrowLeft size={16} className="text-destructive" />,
      description: <Description text="Refund" id={data.account_other_id!} />,
    };
  }
  // always negative
  if (data.account_other === "grant") {
    return {
      icon: <ArrowLeft size={16} className="text-destructive" />,
      description: <Description text="Grant" id={data.account_other_id!} />,
    };
  }
  // investments
  const flow = data.bal_end - data.bal_begin > 0 ? "in" : "out";
  return {
    icon:
      flow === "in" ? (
        <ArrowRight size={16} className="text-success" />
      ) : (
        <ArrowLeft size={16} className="text-destructive" />
      ),
    description: (
      <Description
        text={`Transfer ${flow === "in" ? "from" : "to"} savings`}
        id={flow === "in" ? data.account_other_id! : data.id}
      />
    ),
  };
};
