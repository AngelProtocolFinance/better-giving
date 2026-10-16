import { Marquee } from "@ark-ui/react/marquee";
import { Button } from "@better-giving/ui";
import { Pause, Play } from "lucide-react";
import { useState } from "react";
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
  // two reasons to stand still, kept apart: a hover pause ends when the
  // pointer leaves, a pause the viewer asked for holds until they lift it
  const [held, set_held] = useState(false);
  const [hovered, set_hovered] = useState(false);
  return (
    <section className={`${classes} overflow-hidden py-8`}>
      <p className="eyebrow text-center text-gray-11 px-6">
        Trusted by nonprofits, faith charities, schools &amp; universities
        worldwide
      </p>
      <div className="relative mt-5">
        {/* every logo is alt="" and the eyebrow carries the claim, so the
            strip is drawing, not content; hidden, it also drops zag's
            "Marquee content" region from the landmark list */}
        <Marquee.Root
          side="start"
          speed={30}
          autoFill
          pauseOnInteraction
          paused={held || hovered}
          onPauseChange={({ paused }) => set_hovered(paused)}
          className="group relative w-full"
          aria-hidden
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
        {/* outside the root: inside it, pauseOnInteraction would pause on the
            button's own focus and resume on its blur. no z-index: the root's
            paint containment makes it a stacking context, and this positioned
            sibling after it paints over the edge fade by source order.
            reduced motion already stops the strip, so there is nothing to
            pause */}
        <Button
          type="button"
          variant="secondary"
          icon
          aria-label={held ? "Play logos" : "Pause logos"}
          onClick={() => set_held(!held)}
          classes="absolute right-4 top-1/2 -translate-y-1/2 motion-reduce:hidden"
        >
          {held ? (
            <Play className="icon-md" aria-hidden />
          ) : (
            <Pause className="icon-md" aria-hidden />
          )}
        </Button>
      </div>
    </section>
  );
}
