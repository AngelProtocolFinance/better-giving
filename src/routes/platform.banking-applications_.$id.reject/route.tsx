import { Prompt } from "#/pages/platform-admin/banking-applications/prompt";

export { action } from "#/pages/platform-admin/banking-applications/api";

const Rejected = () => <Prompt verdict="rejected" />;
export default Rejected;
export { ErrorModal as ErrorBoundary } from "#/components/error";
