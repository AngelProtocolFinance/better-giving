import { Marquee } from "@ark-ui/react/marquee";
import { motion } from "motion/react";
import { static_url } from "#/constants/urls";
import { Stats } from "./stats";

const logo_url = (num: number) => static_url(`partners/${num}.webp`);

const partners = Array.from({ length: 76 }, (_, i) => ({
  id: i + 1,
  url: logo_url(i + 1),
}));

interface Props {
  classes?: string;
  of_what?: string;
}

export function Partners({
  classes = "",
  of_what = "nonprofits, faith charities, schools and universities",
}: Props) {
  return (
    <section
      className={`${classes} grid content-start`}
      aria-labelledby="partners-heading"
    >
      <motion.h2
        id="partners-heading"
        className="font-medium text-3xl/tight md:text-3.5xl/tight text-center text-balance mb-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
      >
        Join <span className="font-semibold text-primary">thousands</span> of{" "}
        {of_what}
      </motion.h2>

      <Marquee.Root
        side="top"
        speed={15}
        autoFill
        pauseOnInteraction
        className="group justify-self-center relative w-full h-100"
      >
        <Marquee.Viewport className="w-full h-full overflow-hidden">
          <Marquee.Content className="animate-marquee-y group-data-paused:[animation-play-state:paused] motion-reduce:animate-none">
            <Marquee.Item className="flex flex-wrap gap-8 py-4 justify-center">
              {partners.map((partner) => (
                <img
                  key={partner.id}
                  src={partner.url}
                  alt={`Partner ${partner.id}`}
                  width={80}
                  height={80}
                  className="object-contain"
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </Marquee.Item>
          </Marquee.Content>
        </Marquee.Viewport>
        <Marquee.Edge
          side="top"
          className="absolute top-0 left-0 right-0 h-16 z-10 pointer-events-none bg-linear-to-b from-background to-transparent"
        />
        <Marquee.Edge
          side="bottom"
          className="absolute bottom-0 left-0 right-0 h-16 z-10 pointer-events-none bg-linear-to-t from-background to-transparent"
        />
      </Marquee.Root>
      <Stats classes="mt-16" />
    </section>
  );
}
