import announce from "#/assets/laira/laira-announce.webp";
import cheering from "#/assets/laira/laira-cheering.webp";
import coin from "#/assets/laira/laira-coin.webp";
import gift from "#/assets/laira/laira-gift.webp";
import heart from "#/assets/laira/laira-heart.webp";
import like from "#/assets/laira/laira-like.webp";
import note from "#/assets/laira/laira-note.webp";
import pointing from "#/assets/laira/laira-pointing.webp";
import trophy from "#/assets/laira/laira-trophy.webp";
import type { TPose } from "./progress";

/** intrinsic sizes of the 500px-wide cutouts, so each swap reserves its box */
const POSES: Record<TPose, { src: string; height: number }> = {
  gift: { src: gift, height: 575 },
  heart: { src: heart, height: 625 },
  note: { src: note, height: 775 },
  pointing: { src: pointing, height: 634 },
  trophy: { src: trophy, height: 682 },
  coin: { src: coin, height: 584 },
  announce: { src: announce, height: 486 },
  like: { src: like, height: 730 },
  cheering: { src: cheering, height: 530 },
};

/** the burst's resting spots around Laira, and the ramp step each one is
 *  painted in. sample positions, not a scale: each is a translate on the
 *  spacing ladder. */
const SPARKS = [
  "-translate-x-16 -translate-y-14 bg-amber-9 rounded-full",
  "-translate-x-6 -translate-y-20 bg-blue-9 rotate-45",
  "translate-x-8 -translate-y-24 bg-green-9 rounded-full",
  "translate-x-20 -translate-y-12 bg-red-9 rotate-45",
  "translate-x-24 translate-y-4 bg-amber-9 rounded-full",
  "-translate-x-20 translate-y-2 bg-green-9 rotate-45",
  "translate-x-14 -translate-y-28 bg-amber-9 rotate-45",
  "-translate-x-12 -translate-y-28 bg-red-9 rounded-full",
];

/** warm the cache for every pose, so a swap on scroll paints at once rather
 *  than after a request; the pinned stage calls it when it goes live */
export function preload_poses() {
  for (const { src } of Object.values(POSES)) new Image().src = src;
}

interface ILaira {
  pose: TPose;
  /** in the scroll-driven stage: a new pose hops in */
  live: boolean;
  reduced: boolean;
  /** sparks around her, bursting out when `live`; off for reduced motion */
  burst?: boolean;
  classes?: string;
}

export function Laira({
  pose,
  live,
  reduced,
  burst = false,
  classes = "",
}: ILaira) {
  const p = POSES[pose];
  const hop =
    live && !reduced
      ? "transition duration-base ease-out starting:opacity-0 starting:translate-y-3"
      : "";

  return (
    <div className={classes}>
      <img
        key={pose}
        src={p.src}
        width={500}
        height={p.height}
        alt=""
        loading="lazy"
        className={`h-full w-auto ${hop}`}
      />
      {burst && !reduced && (
        <div className="absolute top-1/3 start-1/2">
          {SPARKS.map((s) => (
            <span
              key={s}
              className={`absolute size-2.5 ${s} ${
                live
                  ? "transition duration-slow ease-out starting:translate-0 starting:scale-0"
                  : ""
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
