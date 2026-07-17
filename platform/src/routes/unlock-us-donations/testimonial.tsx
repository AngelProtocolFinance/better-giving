import { Quote } from "lucide-react";
import { motion } from "motion/react";

export function Testimonial() {
  return (
    <section className="bg-card py-20 md:py-24">
      <div className="xl:container xl:mx-auto px-5 md:px-10">
        <motion.blockquote
          className="max-w-3xl mx-auto text-center grid gap-6"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.4 }}
        >
          <Quote
            size={48}
            className="text-primary/20 justify-self-center"
            strokeWidth={1.5}
          />
          <p className="text-xl md:text-2xl/relaxed text-pretty italic">
            Applying for and receiving grants from US-based foundations has been
            a massive game changer. Better Giving has made this possible by
            providing a US fiscal sponsorship that is secure and
            straightforward.
          </p>
          <footer className="text-muted-fg font-medium">
            <span className="block text-foreground font-bold">
              Founder &amp; Artistic Director
            </span>
            London Arts Charity
          </footer>
        </motion.blockquote>
      </div>
    </section>
  );
}
