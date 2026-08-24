import { ErrorStatus, LoadingStatus } from "@better-giving/ui";
import type { ReactElement } from "react";
import type { QueryState } from "#/types/components";
import { report_error } from "@/errors/report";

type Props<T> = {
  queryState: QueryState<T>;
  messages?: {
    fetching?: string | ReactElement;
    loading?: string | ReactElement;
    error?: string | ReactElement;
  };
  dataRequired?: boolean;
  classes?: { container?: string };
  children(data: NonNullable<T>): ReactElement;
};

export function QueryLoader<T>({
  queryState,
  classes = {},
  messages = {},
  dataRequired = true,
  children,
}: Props<T>) {
  const { container = "" } = classes;
  const { is_loading, is_fetching, is_error, data, error } = queryState;

  if (is_loading) {
    return render_msg(
      (msg) => <LoadingStatus>{msg || "Loading.."}</LoadingStatus>,
      messages.loading,
      container
    );
  }
  if (is_fetching && messages.fetching) {
    return render_msg(
      (msg) => <LoadingStatus>{msg || "Loading.."}</LoadingStatus>,
      messages.fetching,
      container
    );
  }
  if (is_error || (dataRequired && !data)) {
    if (is_error) report_error(error);
    return render_msg(
      (msg) => <ErrorStatus>{msg || "Failed to get data"}</ErrorStatus>,
      messages.error,
      container
    );
  }

  return children(data as NonNullable<T>);
}

function render_msg(
  fallback: (message?: string) => ReactElement,
  message?: string | ReactElement,
  classes?: string
) {
  if (message == null || typeof message === "string") {
    return <div className={classes}>{fallback(message)}</div>;
  }
  return message;
}
