import { tokens_map } from "@better-giving/crypto";
import { useState } from "react";
import { PayQr } from "#/components/donation";
import { Modal } from "#/components/modal";
import { type IPrompt, Prompt } from "#/components/prompt";
import { show_toast } from "#/components/toaster";
import { error_prompt } from "#/helpers/error-prompt";
import type { Payment } from "#/types/crypto";
import { ru_vdec } from "@/helpers/decimal";

interface IQrModal extends Payment {
  order_amount: number;
  on_close: () => void;
}
interface Props {
  payment_id: number | string;
  classes?: string;
  amount: number;
}
export function PaymentResumer({ payment_id, classes, amount }: Props) {
  const [intent_state, set_intent_state] = useState<"pending">();
  const [qr, set_qr] = useState<IQrModal>();
  const [prompt, set_prompt] = useState<IPrompt>();

  return (
    <button
      disabled={intent_state === "pending"}
      type="button"
      className={`${classes} text-xs text-primary`}
      onClick={async () => {
        try {
          set_intent_state("pending");
          const res = await fetch(`/api/crypto-intents/${payment_id}`);
          if (res.status === 410) {
            return show_toast({
              type: "error",
              message: "Donation is already processing.",
            });
          }
          const payment: Payment = await res.json();
          set_qr({
            ...payment,
            order_amount: amount,
            on_close: () => set_qr(undefined),
          });
        } catch (err) {
          set_qr(undefined);
          set_prompt(error_prompt(err));
        } finally {
          set_intent_state(undefined);
        }
      }}
    >
      {intent_state === "pending" ? "Loading..." : "Finish paying"}
      {qr && <QrModal {...qr} on_close={() => set_qr(undefined)} />}
      {prompt && <Prompt {...prompt} onClose={() => set_prompt(undefined)} />}
    </button>
  );
}

function QrModal(props: IQrModal) {
  const token = tokens_map[props.currency];
  return (
    <Modal
      open={true}
      onClose={props.on_close ?? (() => {})}
      classes="fixed-center z-10 grid bg-popover sm:w-full w-[90vw] sm:max-w-lg rounded overflow-hidden px-4 py-8"
    >
      <h4 className="text-lg text-center mb-2">
        Donation to {props.description}
      </h4>

      <p className="text-muted-fg text-balance text-center mb-3.5 max-w-sm justify-self-center">
        To complete your donation, send{" "}
        {ru_vdec(props.order_amount, props.usdpu, token.precision)}
        &nbsp;
        {token.symbol} from your crypto wallet to the address below
      </p>

      <PayQr
        token={token}
        recipient={props.address}
        extraId={props.extra_address ?? null}
      />
    </Modal>
  );
}
