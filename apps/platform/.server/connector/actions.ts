/**
 * Actions `GET /connector/v1/hello` reports as served. The connector filters
 * its tools from this list.
 */
export const CONNECTOR_ACTIONS = [
  "hello",
  "exchange",
  "disconnect",
  "list_campaigns",
  "get_campaign",
  "create_campaign",
  "get_donation_page",
  "get_block_catalog",
  "list_forms",
  "get_form",
  "get_results",
  "list_donations",
  "list_donors",
  "get_donor",
  "list_recurring_gifts",
  "record_donation",
] as const;
