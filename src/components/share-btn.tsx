import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { LinkIcon, MailIcon, ShareIcon } from "lucide-react";
import type React from "react";
import facebook from "#/assets/icons/social/facebook.webp";
import instagram from "#/assets/icons/social/instagram.webp";
import linkedin from "#/assets/icons/social/linkedin.webp";
import x from "#/assets/icons/social/x.webp";
import { Image } from "./image";

interface IShareButton {
  orgName: string;
  url: string;
  classes?: string;
}

interface IMenuItem {
  name: string;
  icon: React.JSX.Element;
  getShareLink: (props: IShareButton) => string;
}

export function ShareButton({ classes = "", ...p }: IShareButton) {
  const menuItems: IMenuItem[] = [
    {
      name: "Facebook",
      icon: <Image src={facebook} width={18} alt="letter F" />,
      getShareLink: ($) => {
        return `https://www.facebook.com/dialog/share?app_id=1286913222079194&display=popup&href=${encodeURIComponent($.url)}`;
      },
    },
    {
      name: "Twitter",
      icon: <Image src={x} width={14} alt="letter X" />,
      getShareLink: ($) => {
        const text = `Please support ${$.orgName} ${$.url} via @betterdotgiving`;
        return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
      },
    },
    {
      name: "LinkedIn",
      icon: <Image src={linkedin} width={20} alt="letters i & n" />,
      getShareLink: ($) => {
        const text = `Please support ${$.orgName} ${$.url} via @better giving`;
        return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
      },
    },
    {
      name: "Instagram",
      icon: <Image src={instagram} width={14} alt="rounded corner camera" />,
      getShareLink: ($) =>
        `https://www.instagram.com/?url=${encodeURIComponent($.url)}`,
    },
    {
      name: "Email",
      icon: <MailIcon size={16} />,
      getShareLink: ($) =>
        `mailto:?subject=${encodeURIComponent(`Support ${$.orgName}`)}`,
    },
  ];

  return (
    <div className={classes}>
      <Menu.Root positioning={{ placement: "bottom", gutter: 8 }}>
        <Menu.Trigger className="focus:outline-none text-primary hover:text-primary transition-colors duration-200">
          <ShareIcon size={20} />
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content className="z-10 grid grid-cols-2 w-max p-3 rounded bg-popover text-popover-fg shadow-xl shadow-black/5 origin-(--transform-origin) data-[state=open]:animate-popup-in data-[state=closed]:animate-popup-out">
              {menuItems.map((item) => (
                <Menu.Item key={item.name} value={item.name} asChild>
                  <a
                    href={item.getShareLink({
                      orgName: p.orgName,
                      url: p.url,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      "hover:bg-muted flex items-center gap-3 px-3 py-2 rounded text-muted-fg hover:text-fg"
                    }
                  >
                    {item.icon}
                    <span className="text-sm ">{item.name}</span>
                  </a>
                </Menu.Item>
              ))}
              <Menu.Item value="copy-link" asChild>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(p.url);
                  }}
                  className={
                    "hover:bg-muted border-t text-sm col-span-full flex items-center gap-3 w-full px-3 py-2 rounded hover:text-fg"
                  }
                >
                  <LinkIcon size={16} />
                  Copy Link
                </button>
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </div>
  );
}
