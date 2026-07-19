import { valibotResolver } from "@hookform/resolvers/valibot";
import { useController, useForm } from "react-hook-form";
import { rd, vdec } from "@/helpers/decimal";
import { init_token_option } from "../../common/constants";
import type { OnIncrement } from "../../common/incrementers";
import {
  crypto_donation_details,
  type CryptoDonationDetails as FV,
} from "../../types";

export function use_rhf(init: FV | undefined) {
  const initial: FV = {
    token: init_token_option,
    tip: "",
    tip_format: "none",
    cover_processing_fee: false,
  };

  const {
    reset,
    setValue,
    handleSubmit,
    getValues,
    trigger,
    control,
    setFocus,
    register,
    formState: { errors },
  } = useForm<FV>({
    defaultValues: init || initial,
    resolver: valibotResolver(crypto_donation_details),
    criteriaMode: "all",
  });

  const { field: token } = useController<FV, "token">({
    control: control,
    name: "token",
  });

  const { field: cpf } = useController({
    control: control,
    name: "cover_processing_fee",
  });

  const { field: tip_format } = useController({
    control: control,
    name: "tip_format",
  });

  const on_increment: OnIncrement = (inc) => {
    const token = getValues("token");
    const amnt = Number(token.amount);
    if (Number.isNaN(amnt)) return trigger("token", { shouldFocus: true });
    setValue(
      "token",
      {
        ...token,
        amount: rd(amnt + inc, vdec(token.usdpu, token.precision)),
      },
      { shouldValidate: true }
    );
  };

  return {
    reset,
    setValue,
    handleSubmit,
    errors,
    getValues,
    setFocus,
    register,

    //controllers
    token,
    tip_format,
    cpf,

    //utils
    on_increment,
  };
}
