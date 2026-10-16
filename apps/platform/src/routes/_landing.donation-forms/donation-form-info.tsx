import { StepsCarousel } from "#/components/donation";

export function DonationFormInfo({ classes = "" }) {
  return (
    <section className={`${classes} grid content-start py-20`}>
      <h2 className="col-span-full text-center hero-heading mb-4">
        Raise more. Save more. Do less.
      </h2>
      <p className="col-span-full mb-4 text-center text-xl text-navy">
        One donation form for everything, 100% free. No setup costs, no
        recurring charges, no platform fees.
      </p>

      <StepsCarousel
        classes="w-full max-w-lg self-center justify-self-center"
        dot_position="bottom"
        hand_position="right"
      />
    </section>
  );
}
