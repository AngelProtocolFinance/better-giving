import { Mail } from "lucide-react";
import { Input } from "platform";

export const Basic = () => <Input name="first_name" placeholder="First name" />;

export const WithIcon = () => (
  <Input
    name="email"
    icon={Mail}
    autoComplete="username"
    placeholder="Email address"
  />
);

export const Filled = () => (
  <Input name="email" icon={Mail} defaultValue="giving@rainforesttrust.org" />
);

export const WithError = () => (
  <Input
    name="email_confirmation"
    icon={Mail}
    defaultValue="giving@rainforest-trust.org"
    error="Email addresses do not match"
  />
);

export const Disabled = () => (
  <Input name="ein" disabled defaultValue="87-3758939" />
);

export const SignupRow = () => (
  <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 gap-3">
      <Input name="first_name" placeholder="First name" />
      <Input name="last_name" placeholder="Last name" />
    </div>
    <Input name="email" icon={Mail} placeholder="Email address" />
  </div>
);
