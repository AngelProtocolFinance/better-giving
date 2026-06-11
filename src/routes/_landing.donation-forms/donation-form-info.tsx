import { StepsCarousel } from "#/components/donation/steps-carousel";

export function DonationFormInfo({ classes = "" }) {
  return (
    <section className={`${classes} grid content-start py-20 px-5`}>
      <h4 className="mb-4 col-span-full text-primary pre-heading uppercase text-center">
        Your all-in-one donation form
      </h4>
      <h2 className="col-span-full text-center hero-heading mb-4">
        Raise more. Save more. Do less.
      </h2>
      <p className="col-span-full mb-4 text-center text-xl text-navy">
        100% free. No setup costs, no recurring charges, no platform fees.
      </p>

      <StepsCarousel
        classes="w-full max-w-lg self-center justify-self-center"
        dot_position="bottom"
        hand_position="right"
      />
    </section>
  );
}
