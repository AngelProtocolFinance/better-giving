interface IHero {
  classes?: string;
}

export function Hero({ classes = "" }: IHero) {
  return (
    <div className={`${classes} pt-20 pb-24 md:pt-28 md:pb-32`}>
      <div className="page grid justify-items-start">
        <h1 className="hero-heading max-w-5xl">
          A nonprofit whose mission is your mission's money
        </h1>
        <p className="section-body mt-6 text-gray-11 max-w-3xl">
          Since 2021, Better Giving has offered donation forms, savings, and
          fund growth tools, with a simple belief: the organizations doing the
          work should keep the money.
        </p>
      </div>
    </div>
  );
}
