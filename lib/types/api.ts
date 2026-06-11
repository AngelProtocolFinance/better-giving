export interface IPageKeyed<T> {
  items: T[];
  /** base64, json str */
  next?: string;
}

export interface IPageNumbered<T> {
  items: T[];
  /** page number, starts from 1 */
  page: number;
  /** total pages */
  pages: number;
}

export type URLFunc = (
  url: URL,
  prepend: (x: string) => string
) => URL | string;
export type InitFunc = (h: Headers) => RequestInit;
export type Fetcher = (
  url_fn: URLFunc,
  init_fn?: InitFunc
) => Promise<Response>;
