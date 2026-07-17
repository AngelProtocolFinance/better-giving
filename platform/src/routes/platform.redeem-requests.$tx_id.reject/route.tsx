import { Prompt } from "#/pages/platform-admin/redeem-requests/prompt";

export { action } from "#/pages/platform-admin/redeem-requests/api";

const Rejected = () => <Prompt verdict="reject" />;
export default Rejected;
export { ErrorModal as ErrorBoundary } from "#/components/error";
