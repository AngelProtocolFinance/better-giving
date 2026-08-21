// packages/ui reaches this project through its barrel, and one component
// (Target) imports an svg as a url. packages/ui itself gets that declaration
// from `vite/client`; this project has no vite, and pulling one in to declare
// a single module would be the more expensive half of the trade.
declare module "*.svg" {
  const src: string;
  export default src;
}
