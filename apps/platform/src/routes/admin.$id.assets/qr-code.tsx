import { QrCode as Ark } from "@ark-ui/react/qr-code";
import { TabPanel, Tabs } from "@better-giving/ui";
import { ArrowDownToLineIcon } from "lucide-react";
import { useState } from "react";
import org_building from "#/assets/icons/org-building.svg";

type QRCodeType = "profile" | "donation" | "campaign";

interface Props {
  classes?: string;
  logo?: string;
  profile_url: string;
  donate_url: string;
  campaign_url?: string;
  /** published pages open the address. drafts, and the assets page, keep text. */
  link_url?: boolean;
}

export function QrCode({
  classes = "",
  logo,
  profile_url,
  donate_url,
  campaign_url,
  link_url = false,
}: Props) {
  const tabs: { id: QRCodeType; name: string }[] = campaign_url
    ? [{ id: "campaign", name: "Campaign" }]
    : [
        { id: "profile", name: "Profile" },
        { id: "donation", name: "Donation Page" },
      ];
  const [color, set_color] = useState("#000000");
  const [show_logo, set_show_logo] = useState(true);
  const [selected_tab, set_selected_tab] = useState<QRCodeType>(tabs[0].id);

  const urls: Record<QRCodeType, string> = {
    profile: profile_url,
    donation: donate_url,
    campaign: campaign_url ?? donate_url,
  };

  const handle_download = () => {
    const svg = document.querySelector("#qr-code-svg");
    if (!svg) return;

    const svg_data = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const qr_img = new Image();

    const qr_size = 512;
    const padding = 48;
    const total_size = qr_size + padding * 2;

    qr_img.onload = () => {
      canvas.width = total_size;
      canvas.height = total_size;

      if (ctx) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, total_size, total_size);
        ctx.drawImage(qr_img, padding, padding, qr_size, qr_size);

        if (show_logo) {
          const logo_img = new Image();
          logo_img.crossOrigin = "anonymous";
          logo_img.onload = () => {
            const logo_size = 96;
            const logo_x = (total_size - logo_size) / 2;
            const logo_y = (total_size - logo_size) / 2;

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(logo_x - 4, logo_y - 4, logo_size + 8, logo_size + 8);
            ctx.drawImage(logo_img, logo_x, logo_y, logo_size, logo_size);

            const png_file = canvas.toDataURL("image/png");
            const download_link = document.createElement("a");
            download_link.download = `qr-code-${selected_tab}.png`;
            download_link.href = png_file;
            download_link.click();
          };
          logo_img.onerror = () => {
            const png_file = canvas.toDataURL("image/png");
            const download_link = document.createElement("a");
            download_link.download = `qr-code-${selected_tab}.png`;
            download_link.href = png_file;
            download_link.click();
          };
          logo_img.src = logo || org_building;
        } else {
          const png_file = canvas.toDataURL("image/png");
          const download_link = document.createElement("a");
          download_link.download = `qr-code-${selected_tab}.png`;
          download_link.href = png_file;
          download_link.click();
        }
      }
    };

    qr_img.src = `data:image/svg+xml;base64,${btoa(svg_data)}`;
  };

  return (
    <div className={classes}>
      <h2 className="text-2xl font-bold mb-2">QR Code</h2>

      <Tabs
        className="w-full max-w-96"
        items={tabs.map((tab) => ({ value: tab.id, label: tab.name }))}
        defaultValue={tabs[0].id}
        onValueChange={set_selected_tab}
      >
        {/* qr code panel */}
        {tabs.map((tab) => (
          <TabPanel key={tab.id} value={tab.id} className="mt-6">
            <Ark.Root
              value={urls[tab.id]}
              pixelSize={256}
              encoding={{ ecc: "H" }}
              ids={{ frame: "qr-code-svg" }}
              className="relative bg-white w-fit"
              style={{ color }}
            >
              <Ark.Frame className="w-64 h-64 fill-current">
                <Ark.Pattern />
              </Ark.Frame>
              {show_logo && (
                <Ark.Overlay className="bg-white p-1">
                  <img
                    src={logo || org_building}
                    alt=""
                    width={48}
                    height={48}
                  />
                </Ark.Overlay>
              )}
            </Ark.Root>
            <p className="text-sm text-gray-11 mt-1">
              {tab.name}:{" "}
              {link_url ? (
                <a
                  href={urls[tab.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link font-mono text-xs break-all"
                >
                  {urls[tab.id]}
                </a>
              ) : (
                <span className="font-mono text-xs break-all">
                  {urls[tab.id]}
                </span>
              )}
            </p>
          </TabPanel>
        ))}

        <div className="mt-4 flex gap-x-2 items-center justify-items-center">
          <label htmlFor="qr-color" className="label">
            Color
          </label>
          <input
            id="qr-color"
            type="color"
            value={color}
            onChange={(e) => set_color(e.target.value)}
          />

          <div className="flex items-center gap-x-1">
            <input
              id="show-logo"
              type="checkbox"
              checked={show_logo}
              onChange={(e) => set_show_logo(e.target.checked)}
              className="checkbox"
            />
            <label htmlFor="show-logo" className="label">
              Show logo in center
            </label>
          </div>
        </div>

        <button
          className="flex items-center mt-4 btn btn-primary gap-x-2"
          type="button"
          onClick={handle_download}
        >
          <ArrowDownToLineIcon className="icon-sm" />
          Download
        </button>
      </Tabs>
    </div>
  );
}
