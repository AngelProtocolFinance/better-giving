import laira_waiving from "#/assets/laira/laira-waiving.webp";
import { Image } from "#/components/image";

interface Props {
  classes?: string;
}

export function NoDonations({ classes = "" }: Props) {
  return (
    <div
      className={`${classes} max-sm:text-center grid sm:grid-cols-[1fr_auto] max-w-md gap-y-2 gap-x-4`}
    >
      <Image
        alt="Laira mascot waving"
        src={laira_waiving}
        className="max-sm:place-self-center sm:col-start-2 sm:row-start-1 sm:row-span-2"
        width={100}
      />
      <h3 className="text-lg self-end">No donations found.</h3>
      <p className="self-start text-muted-fg">
        Take a look at our marketplace to choose from hundreds of nonprofits
        that are waiting for your donation. Every donation makes a difference.
      </p>
    </div>
  );
}
