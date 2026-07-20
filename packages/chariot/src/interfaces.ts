import type * as chariot from "./generated/chariot.js";

/**
 * API paths
 */
export const create_grant_path = "/v1/grants" as const;
export const get_grant_path = "/v1/grants/{id}" as const;

/**
 * Schema types
 */
export type Grant = chariot.components["schemas"]["Grant"];

/**
 * Request types
 */
export type CreateGrantRequest =
  chariot.components["requestBodies"]["GrantCaptureRequest"]["content"]["application/json"];

/**
 * Chariot SDK configuration
 */
export interface ISdkConfig {
  api_key: string;
  api_url: string;
}
