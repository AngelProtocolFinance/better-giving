import { Prompt } from "#/pages/platform-admin/banking-applications/prompt";

export { action } from "#/pages/platform-admin/banking-applications/api";

const Approved = () => <Prompt verdict="approved" />;
export default Approved;
export { ErrorModal as ErrorBoundary } from "#/components/error";
