export type Ensure<T, K extends keyof T> = T & Required<{ [key in K]: T[key] }>;
