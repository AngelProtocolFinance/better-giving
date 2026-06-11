/** unix cron: every 3 days at midnight UTC */
export const GRANTS_CRON = "0 0 */3 * *";
/** aws eventbridge format */
export const GRANTS_CRON_AWS = "cron(0 0 */3 * ? *)";
/** step function wait between notify and execute (days) */
export const GRANTS_EXEC_DELAY_DAYS = 1;
