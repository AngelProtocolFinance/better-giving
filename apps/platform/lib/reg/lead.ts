/** The contract between the marketing lead forms and the action behind them.
 * Isomorphic on purpose: the action is server-only, so the pages cannot read
 * these off it without pulling the whole server graph into the browser. */

/** one message per field, keyed by the name the forms post */
export interface ILeadErrors {
  o_name?: string;
  o_ein?: string;
  o_hq_country?: string;
  o_registration_number?: string;
  email?: string;
}

/** every posted value, echoed back verbatim under the name it arrived as, so
 * a failed submit repopulates instead of clearing. absent fields are `""` —
 * each page posts its own subset.
 *
 * Verbatim is a constraint, not a description. The forms seed their state from
 * these on a document POST but keep local state on the hydrated path, so any
 * normalization on the way back (trimming, lowercasing, re-masking) would show
 * one thing to a browser that ran js and another to one that didn't. Build
 * these straight off the raw `FormData` and parse a separate copy. */
export interface ILeadValues {
  o_name: string;
  o_ein: string;
  o_hq_country: string;
  o_registration_number: string;
  email: string;
}

/** what a failed submit answers with. success is a redirect, so this is the
 * only thing the pages ever read back. */
export interface ILeadInvalid {
  errors: ILeadErrors;
  values: ILeadValues;
  /** set only when the browser holds a session for a *different* address than
   * the one posted. nothing was written; the form offers the two ways out. */
  signed_in_as?: string;
}
