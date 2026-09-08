import { useEffect } from "react";

interface FormEmbedContainerProps {
  id: string;
  style?: React.CSSProperties;
  classes?: string;
}

export function FormEmbedContainer({
  id,
  style,
  classes,
}: FormEmbedContainerProps) {
  useEffect(() => {
    // effect only runs client-side, so document is safe here.
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

  return <div data-bg-form={id} style={style} className={classes} />;
}
