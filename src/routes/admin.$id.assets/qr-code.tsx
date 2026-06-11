import { Tabs } from "@base-ui/react/tabs";
import { ArrowDownToLineIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import org_building from "#/assets/icons/org-building.svg";

type QRCodeType = "profile" | "donation";

const tabs: { id: QRCodeType; name: string }[] = [
  { id: "profile", name: "Profile" },
  { id: "donation", name: "Donation Page" },
];

interface Props {
  classes?: string;
  logo?: string;
  profile_url: string;
  donate_url: string;
}

export function QrCode({ classes = "", logo, profile_url, donate_url }: Props) {
  const [color, set_color] = useState("#000000");
  const [show_logo, set_show_logo] = useState(true);
  const [selected_tab, set_selected_tab] = useState<QRCodeType>("profile");

  const urls: Record<QRCodeType, string> = {
    profile: profile_url,
    donation: donate_url,
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

      <Tabs.Root
        className="w-96"
        defaultValue="profile"
        onValueChange={(val) => set_selected_tab(val as QRCodeType)}
      >
        <Tabs.List className="flex gap-2 mb-6 border-b">
          {tabs.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              value={tab.id}
              className="px-4 border-b-2 py-2 text-sm font-medium transition-colors focus:outline-none border-transparent text-muted-fg hover:text-fg data-[active]:border-primary data-[active]:text-primary"
            >
              {tab.name}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {/* QR Code Panel */}
        {tabs.map((tab) => (
          <Tabs.Panel key={tab.id} value={tab.id}>
            <QRCodeSVG
              id="qr-code-svg"
              value={urls[tab.id]}
              size={256}
              fgColor={color}
              bgColor="#ffffff"
              level="H"
              imageSettings={
                show_logo
                  ? {
                      src: logo || org_building,
                      height: 48,
                      width: 48,
                      excavate: true,
                    }
                  : undefined
              }
            />
            <p className="text-sm text-muted-fg mt-1">
              {tab.name}:{" "}
              <span className="font-mono text-xs">{urls[tab.id]}</span>
            </p>
          </Tabs.Panel>
        ))}

        <div className="mt-4 flex gap-x-2 items-center justify-items-center">
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
          className="flex text-sm items-center mt-4 btn btn-primary py-2 px-4 gap-x-2"
          type="button"
          onClick={handle_download}
        >
          <ArrowDownToLineIcon size={14} />
          Download
        </button>
      </Tabs.Root>
    </div>
  );
}
