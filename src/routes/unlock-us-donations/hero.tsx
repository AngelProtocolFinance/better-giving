import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import { href, Link } from "react-router";
import { BOOK_A_DEMO } from "#/constants/urls";

const hero_img =
  "https://cnfc6hjkztdschkg.public.blob.vercel-storage.com/landing/fsa-hero.webp";

export function Hero() {
  return (
    <section className="relative overflow-hidden min-h-90 md:min-h-105 lg:min-h-120 flex items-center bg-[#1a3c5e]">
      {/* full-bleed background image — anchor right to keep illustration visible */}
      <img
        src={hero_img}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-right"
      />

      {/* gradient overlay — full cover on mobile, left-to-right on desktop */}
      <div className="absolute inset-0 bg-[#1a3c5e]/70 md:bg-transparent md:bg-linear-to-r md:from-[#1a3c5e] md:via-[#1a3c5e]/80 md:via-35% md:to-transparent md:to-60%" />

      <div className="xl:container xl:mx-auto px-5 md:px-10 relative py-20 md:py-28">
        <motion.div
          className="grid gap-5 max-w-xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1 className="hero-heading font-bold text-white drop-shadow-lg">
            Local Mission.
            <br />
            Global Support.
          </h1>

          <p className="text-base md:text-xl text-white/90 drop-shadow">
            Tap into $499 Billion in US donations without the cost of setting up
            a US entity. Secure grants, DAFs, and crypto gifts for your UK
            charity.
          </p>

          <div className="flex flex-col lg:flex-row gap-3 md:gap-4 mt-2">
            <Link
              to={href("/register/welcome")}
              className="btn btn-primary px-6 md:px-8 py-2.5 md:py-3 rounded text-sm md:text-lg text-nowrap capitalize inline-flex items-center gap-2"
            >
              Join us today!
              <ArrowRight size={18} />
            </Link>
            <Link
              to={BOOK_A_DEMO}
              target="_blank"
              className="btn border border-white/40 text-white hover:bg-white/10 active:bg-white/15 px-6 md:px-8 py-2.5 md:py-3 rounded text-sm md:text-lg text-nowrap capitalize backdrop-blur-sm"
            >
              Or book a demo with our UK team
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
