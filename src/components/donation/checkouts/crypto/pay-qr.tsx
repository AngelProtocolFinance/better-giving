import { QrCode } from "@ark-ui/react/qr-code";
import { type IToken, is_custom } from "@better-giving/crypto";
import { logo_url } from "@/constants/common";
import { Copier } from "../../../copier";

interface Props {
  classes?: string;
  token: IToken;
  recipient: string;
  extraId: string | null;
}

export function PayQr({ classes = "", ...props }: Props) {
  return (
    <div className={`${classes} grid justify-items-center`}>
      <QrCode.Root
        value={props.recipient}
        pixelSize={192}
        className="mb-3.5 relative bg-white w-fit"
        style={{ color: "#000" }}
      >
        <QrCode.Frame className="w-48 h-48 fill-current">
          <QrCode.Pattern />
        </QrCode.Frame>
        <QrCode.Overlay className="bg-white p-0.5">
          <img
            src={logo_url(props.token.logo, is_custom(props.token.id))}
            alt=""
            width={20}
            height={20}
          />
        </QrCode.Overlay>
      </QrCode.Root>
      <p className="text-sm mb-4">{props.recipient}</p>
      <Copier
        text={props.recipient}
        classes={{
          container:
            "flex items-center gap-2 px-2 py-1.5 rounded border shadow-md shadow-black/5",
          icon: "size-5",
        }}
      >
        <span className="text-sm">Copy Address</span>
      </Copier>
      {props.extraId && <Memo classes="mt-4" val={props.extraId} />}
    </div>
  );
}

interface IMemo {
  val: string;
  classes?: string;
}
function Memo({ val, classes = "" }: IMemo) {
  return (
    <div className={`grid justify-items-center ${classes}`}>
      <p className="text-sm mb-2">{val}</p>
      <Copier
        text={val}
        classes={{
          container:
            "flex items-center gap-2 px-2 py-1.5 rounded border shadow-md shadow-black/5",
          icon: "size-5",
        }}
      >
        <span className="capitalize text-sm">Copy Memo</span>
      </Copier>
    </div>
  );
}
