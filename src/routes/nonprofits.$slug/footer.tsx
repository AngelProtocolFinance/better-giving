import { Link } from "react-router";
import { app_name } from "#/constants/env";
import { PRIVACY_POLICY, TERMS_OF_USE_NPO } from "#/constants/urls";

export function Footer({ className = "" }: { className?: string }) {
  return (
    <footer className={`${className} p-6 text-sm  text-center`}>
      © Copyright {new Date().getFullYear()} {app_name} |{" "}
      <Link to={PRIVACY_POLICY}>Privacy Policy</Link> |{" "}
      <Link to={TERMS_OF_USE_NPO}>Terms of Use</Link>
    </footer>
  );
}
