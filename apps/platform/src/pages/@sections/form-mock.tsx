import {
  ChartSpline,
  ChevronDown,
  Coins,
  CreditCard,
  HandCoins,
  Heart,
  Lock,
  Pause,
  Play,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const reduce_query = "(prefers-reduced-motion: reduce)";

function subscribe_reduced(cb: () => void) {
  const mq = window.matchMedia(reduce_query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** server renders as reduced: the static Card face, until the client knows */
function use_reduced_motion() {
  return useSyncExternalStore(
    subscribe_reduced,
    () => window.matchMedia(reduce_query).matches,
    () => true
  );
}

const field =
  "flex items-center gap-2 rounded border border-gray-7 bg-surface px-3 py-2.5 text-sm text-gray-12";
const field_label = "text-xs font-semibold text-gray-11";

function MockField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className={field_label}>{label}</span>
      <span className={field}>{children}</span>
    </div>
  );
}

const amounts = ["$25", "$50", "$100", "$250"] as const;

function CardBody() {
  return (
    <div className="grid gap-4 content-start">
      <div className="grid grid-cols-2 gap-1 rounded bg-gray-3 p-1 text-sm font-semibold">
        <span className="rounded py-1.5 text-center text-gray-11">
          One-time
        </span>
        <span className="rounded bg-surface py-1.5 text-center text-gray-12">
          Monthly
        </span>
      </div>
      <div className="grid gap-1.5">
        <span className={field_label}>Amount</span>
        <div className="grid grid-cols-4 gap-2 figures">
          {amounts.map((a) => (
            <span
              key={a}
              className={`rounded border py-2.5 text-center text-sm font-semibold text-gray-12 ${a === "$100" ? "border-primary bg-secondary" : "border-gray-7 bg-surface"}`}
            >
              {a}
            </span>
          ))}
        </div>
        <span className={field}>
          <span className="text-gray-11">Other amount</span>
        </span>
      </div>
    </div>
  );
}

function StockBody() {
  return (
    <div className="grid gap-3 content-start">
      <MockField label="Stock ticker">
        <span className="font-semibold">AAPL</span>
        <span className="text-gray-11">Apple Inc.</span>
      </MockField>
      <MockField label="Number of shares">
        <span className="figures">10</span>
      </MockField>
      <p className="text-sm text-gray-11">Value set at transfer</p>
    </div>
  );
}

function DafBody() {
  return (
    <div className="grid gap-3 content-start">
      <MockField label="Grant from your DAF">
        <HandCoins className="icon-md text-gray-11" />
        <span>Your DAF provider</span>
        <ChevronDown className="icon-md ml-auto text-gray-11" />
      </MockField>
      <MockField label="Grant amount">
        <span className="figures">$1,000</span>
      </MockField>
    </div>
  );
}

function CryptoBody() {
  return (
    <div className="grid gap-3 content-start">
      <MockField label="Coin">
        <Coins className="icon-md text-gray-11" />
        <span className="font-semibold">ETH</span>
        <span className="text-gray-11">Ethereum</span>
        <ChevronDown className="icon-md ml-auto text-gray-11" />
      </MockField>
      <MockField label="Amount">
        <span className="figures">0.05</span>
      </MockField>
      <p className="flex gap-2 text-sm text-gray-11">
        Network
        <span className="font-semibold text-gray-12">Ethereum</span>
      </p>
    </div>
  );
}

const tabs = [
  {
    id: "card",
    name: "Card",
    Icon: CreditCard,
    cta: "Donate $100 monthly",
    Body: CardBody,
  },
  {
    id: "stock",
    name: "Stock",
    Icon: ChartSpline,
    cta: "Transfer stock",
    Body: StockBody,
  },
  {
    id: "daf",
    name: "DAF",
    Icon: HandCoins,
    cta: "Recommend grant",
    Body: DafBody,
  },
  {
    id: "crypto",
    name: "Crypto",
    Icon: Coins,
    cta: "Send crypto",
    Body: CryptoBody,
  },
] as const;

export interface IFormMock {
  classes?: string;
  interval_ms?: number;
}

/**
 * a token-built illustration of the donation form that cycles its gift types.
 * decorative: the drawing is hidden and inert, a sibling sentence describes it.
 * the toggle under it is the keyboard and touch path to stopping the motion
 * (WCAG 2.2.2); hover only holds a face for as long as the pointer stays.
 */
export function FormMock({ classes = "", interval_ms = 3500 }: IFormMock) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = use_reduced_motion();
  const [hovered, set_hovered] = useState(false);
  const [paused, set_paused] = useState(false);
  const [on_screen, set_on_screen] = useState(false);
  const [active, set_active] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      set_on_screen(e.isIntersecting)
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const playing = !reduced && !paused && !hovered && on_screen;

  // rescheduled from the face that landed, so a resume waits a full interval
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(
      () => set_active((active + 1) % tabs.length),
      interval_ms
    );
    return () => clearTimeout(t);
  }, [playing, active, interval_ms]);

  return (
    <div
      ref={ref}
      className={`${classes} grid gap-3`}
      onPointerEnter={() => set_hovered(true)}
      onPointerLeave={() => set_hovered(false)}
    >
      <p className="sr-only">
        Illustration of the Better Giving donation form, which accepts card,
        stock, donor-advised fund and crypto gifts.
      </p>
      <div
        aria-hidden="true"
        inert
        data-active={tabs[active].id}
        className="card-on-band shadow-lift-media grid gap-5 select-none"
      >
        <div className="flex items-center gap-3">
          <span className="flex-center size-9 rounded-full bg-secondary text-primary">
            <Heart className="icon-md" />
          </span>
          <span className="font-semibold text-gray-12">Your nonprofit</span>
          <span className="ml-auto flex items-center gap-1 text-xs text-gray-11">
            <Lock className="icon-xs" />
            Secure
          </span>
        </div>

        <div className="relative grid grid-cols-4 border-b">
          {tabs.map((t, i) => (
            <span
              key={t.id}
              className={`grid justify-items-center gap-1.5 pb-3 text-xs font-semibold transition-colors ${i === active ? "text-gray-12" : "text-gray-11"}`}
            >
              <t.Icon
                className={`icon-lg transition-colors ${i === active ? "text-primary" : ""}`}
              />
              {t.name}
            </span>
          ))}
          <span
            className="absolute -bottom-px left-0 h-0.5 w-1/4 bg-primary transition-transform duration-base"
            style={{ transform: `translateX(${active * 100}%)` }}
          />
        </div>

        {/* every face shares one grid cell, so the card is the height of the
            tallest and never jumps as they swap */}
        <div className="grid">
          {tabs.map((t, i) => (
            <div
              key={t.id}
              className={`col-start-1 row-start-1 transition-opacity duration-base ${i === active ? "" : "opacity-0"}`}
            >
              <t.Body />
            </div>
          ))}
        </div>

        <span className="grid rounded bg-primary py-3 text-center text-sm font-bold text-primary-fg">
          {tabs.map((t, i) => (
            <span
              key={t.id}
              className={`col-start-1 row-start-1 transition-opacity duration-base ${i === active ? "" : "opacity-0"}`}
            >
              {t.cta}
            </span>
          ))}
        </span>
      </div>
      {/* nothing moves under reduced motion, so there is nothing to pause */}
      {reduced ? null : (
        <button
          type="button"
          onClick={() => set_paused(!paused)}
          aria-label={paused ? "Play animation" : "Pause animation"}
          className="btn btn-icon btn-secondary justify-self-end"
        >
          {paused ? (
            <Play aria-hidden="true" className="icon-xl" />
          ) : (
            <Pause aria-hidden="true" className="icon-xl" />
          )}
        </button>
      )}
    </div>
  );
}
