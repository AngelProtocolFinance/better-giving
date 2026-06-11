import { Prompt } from "#/pages/platform-admin/redeem-requests/prompt";

export { action } from "#/pages/platform-admin/redeem-requests/api";

const Approved = () => <Prompt verdict="approve" />;
export default Approved;
export { ErrorModal as ErrorBoundary } from "#/components/error";
