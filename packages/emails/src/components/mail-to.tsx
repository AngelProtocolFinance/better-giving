import type { ReactNode } from "react";
import { Link } from "./link";

export interface MailToProps {
  email: string;
  children?: ReactNode;
}

export function MailTo({ email, children }: MailToProps) {
  return <Link href={`mailto:${email}`}>{children ?? email}</Link>;
}
