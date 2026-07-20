function get_env(name: string): string {
  const value = process.env[name];
  if (!value) throw `${name} is not defined`;
  return value;
}

export const finnhub_api_key = get_env("finnhub_api_key");
export const finnhub_base_url = get_env("finnhub_base_url");
