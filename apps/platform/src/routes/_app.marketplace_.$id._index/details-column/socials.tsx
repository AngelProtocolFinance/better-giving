import { ExtLink } from "@better-giving/ui";
import discordIcon from "#/assets/icons/social/discord.svg";
import facebookIcon from "#/assets/icons/social/facebook.webp";
import instagramIcon from "#/assets/icons/social/instagram.webp";
import linkedinIcon from "#/assets/icons/social/linkedin.webp";
import tiktokIcon from "#/assets/icons/social/tiktok.webp";
import xIcon from "#/assets/icons/social/x.webp";
import youtubeIcon from "#/assets/icons/social/youtube.webp";
import type { INpo } from "$/pg/queries/npo";

export function Socials(props: Pick<INpo, "social_media_urls">) {
  const { facebook, linkedin, twitter, discord, instagram, youtube, tiktok } =
    props.social_media_urls ?? {};
  return (
    <div className="flex items-center gap-4">
      {facebook && (
        <SocialsIcon
          href={facebook}
          src={facebookIcon}
          size={22}
          label="Facebook"
        />
      )}
      {linkedin && (
        <SocialsIcon
          href={linkedin}
          src={linkedinIcon}
          size={24}
          label="LinkedIn"
        />
      )}
      {twitter && (
        <SocialsIcon href={twitter} src={xIcon} size={18} label="X" />
      )}
      {discord && (
        <SocialsIcon
          href={discord}
          src={discordIcon}
          size={25}
          label="Discord"
        />
      )}
      {instagram && (
        <SocialsIcon
          href={instagram}
          src={instagramIcon}
          size={20}
          label="Instagram"
        />
      )}
      {youtube && (
        <SocialsIcon
          href={youtube}
          src={youtubeIcon}
          size={22}
          label="YouTube"
        />
      )}
      {tiktok && (
        <SocialsIcon href={tiktok} src={tiktokIcon} size={21} label="TikTok" />
      )}
    </div>
  );
}

interface ISocialsIcon {
  href: string;
  src: string;
  size: number;
  label: string;
}

const SocialsIcon = (props: ISocialsIcon) => (
  <ExtLink href={props.href} aria-label={props.label}>
    <img src={props.src} width={props.size} alt="" />
  </ExtLink>
);
