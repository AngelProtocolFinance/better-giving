import { Marquee } from "@ark-ui/react/marquee";
import { static_url } from "#/constants/urls";

const partners = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  url: static_url(`partners/${i + 1}.webp`),
}));

interface IPartnersStrip {
  classes?: string;
}

/** horizontal partner logo strip — slow scroll, mkt pages */
export function PartnersStrip({ classes = "" }: IPartnersStrip) {
  return (
    <section className={`${classes} overflow-hidden py-8`}>
      <p className="text-center text-xs font-bold uppercase tracking-wider text-muted-fg px-6">
        Trusted by nonprofits, faith charities, schools &amp; universities
        worldwide
      </p>
      <Marquee.Root
        side="start"
        speed={30}
        autoFill
        pauseOnInteraction
        className="group relative w-full mt-5"
      >
        <Marquee.Viewport className="w-full overflow-hidden">
          <Marquee.Content className="animate-marquee-x group-data-paused:[animation-play-state:paused] motion-reduce:animate-none">
            <Marquee.Item className="flex items-center gap-16 px-8">
              {partners.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt=""
                  className="h-13 w-auto object-contain grayscale opacity-60 transition group-hover:opacity-90"
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </Marquee.Item>
          </Marquee.Content>
        </Marquee.Viewport>
        <Marquee.Edge
          side="start"
          className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-linear-to-r from-background to-transparent"
        />
        <Marquee.Edge
          side="end"
          className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none bg-linear-to-l from-background to-transparent"
        />
      </Marquee.Root>
    </section>
  );
}
