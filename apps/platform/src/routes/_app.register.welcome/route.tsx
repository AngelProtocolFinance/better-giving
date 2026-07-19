import { CircleCheck } from "lucide-react";
import { Form, useNavigation } from "react-router";
import { LoadText } from "#/components/load-text";
import { app_name } from "#/constants/env";

export { ErrorBoundary } from "#/components/error";
export { new_application as action } from "#/pages/registration/new-application";
export default function Welcome() {
  const nav = useNavigation();
  return (
    <Form method="POST" className="grid justify-items-center mx-6">
      <CircleCheck className="text-success" size={80} />
      <h1 className="text-3xl mt-10 text-center text-balance">
        Thank you for joining {app_name}!
      </h1>
      <p className="text-center text-pretty text-muted-fg/75 w-full text-lg max-w-lg mt-4 mb-8">
        Your account is ready - next, register your nonprofit to become a
        member.
      </p>

      <button
        type="submit"
        disabled={nav.state === "submitting"}
        className="w-full max-w-105 btn btn-primary text-sm"
      >
        <LoadText
          is_loading={nav.state === "submitting"}
          text="Continue Registration"
        >
          Continue Registration
        </LoadText>
      </button>

      <p className="text-sm italic text-muted-fg mt-8 text-center">
        Note: You can finish later. We've emailed you a link to pick up where
        you left off.
      </p>
    </Form>
  );
}
