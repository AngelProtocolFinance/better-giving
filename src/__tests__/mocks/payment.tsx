import { vi } from "vitest";

// suppress external script loading from payment SDKs.
// test files needing behavioral mocks (e.g. checkout.test.tsx)
// can override with their own vi.mock calls.
vi.mock("@stripe/stripe-js", () => ({
  loadStripe: () => Promise.resolve(null),
}));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: any) => children,
  PaymentElement: () => <div />,
  ExpressCheckoutElement: () => <div />,
  useStripe: () => null,
  useElements: () => null,
}));
// v6: returning null short-circuits sdk init in tests
vi.mock("@paypal/paypal-js/sdk-v6", () => ({
  loadCoreSdkScript: () => Promise.resolve(null),
}));
// recharts uses CJS internally; vi.mock must cover every named export
// the component tree might import, otherwise browser ESM validation fails.
const _null = () => null;
vi.mock("recharts", () => ({
  Area: _null,
  AreaChart: _null,
  Bar: _null,
  BarChart: _null,
  Brush: _null,
  CartesianAxis: _null,
  CartesianGrid: _null,
  Cell: _null,
  ComposedChart: _null,
  Cross: _null,
  Curve: _null,
  Customized: _null,
  DefaultLegendContent: _null,
  DefaultTooltipContent: _null,
  Dot: _null,
  ErrorBar: _null,
  Funnel: _null,
  FunnelChart: _null,
  Global: _null,
  Label: _null,
  LabelList: _null,
  Layer: _null,
  Legend: _null,
  Line: _null,
  LineChart: _null,
  Pie: _null,
  PieChart: _null,
  PolarAngleAxis: _null,
  PolarGrid: _null,
  PolarRadiusAxis: _null,
  Polygon: _null,
  Radar: _null,
  RadarChart: _null,
  RadialBar: _null,
  RadialBarChart: _null,
  Rectangle: _null,
  ReferenceArea: _null,
  ReferenceDot: _null,
  ReferenceLine: _null,
  ResponsiveContainer: ({ children }: any) => children,
  Sankey: _null,
  Scatter: _null,
  ScatterChart: _null,
  Sector: _null,
  SunburstChart: _null,
  Surface: _null,
  Symbols: _null,
  Text: _null,
  Tooltip: _null,
  Trapezoid: _null,
  Treemap: _null,
  XAxis: _null,
  YAxis: _null,
  ZAxis: _null,
}));
