import { useEffect } from "react";

interface FormEmbedContainerProps {
  id: string;
  style?: React.CSSProperties;
  className?: string;
}

export function FormEmbedContainer({
  id,
  style,
  className,
}: FormEmbedContainerProps) {
  useEffect(() => {
    // effect only runs client-side, so document is safe here.
    // remove any existing embed scripts
    for (const s of document.querySelectorAll("script[data-bg-embed]")) {
      s.remove();
    }

    // add fresh script with cache-busting param
    const script = document.createElement("script");
    script.src = `https://better.giving/form-embed.js?t=${Date.now()}`;
    script.async = true;
    script.dataset.bgEmbed = "true";
    document.body.appendChild(script);
  }, []);

  return <div data-bg-form={id} style={style} className={className} />;
}
