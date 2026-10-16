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
        className="section-heading font-medium mb-8"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ type: "spring" }}
      >
        {`Join thousands of ${of_what}`}
      </motion.h2>

      <Marquee.Root
        side="top"
        speed={15}
        autoFill
        pauseOnInteraction
        className="group justify-self-center relative w-full h-100"
      >
        {/* the ends fade by masking the logos, not by painting the ground
            over them, so the fade holds on any fill the caller sets */}
        <Marquee.Viewport className="w-full h-full overflow-clip mask-y-from-85%">
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
      </Marquee.Root>
      <Stats classes="mt-16" />
    </section>
  );
}
