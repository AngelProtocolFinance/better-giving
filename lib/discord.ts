// https://discord.com/developers/docs/resources/message#create-message

interface Field {
  name: string;
  value: string;
  inline?: true;
}

export interface Alert {
  /** ends up in embed.author */
  from: string;
  /** ends up in content section, up to 2000 characters */
  title: string;
  /** ends up in embed.description */
  body?: string;

  /** additional structured content */
  fields?: Field[];
  /*
   * ERROR: accent is red; title is prepended i.e ERROR:{title}
   * @default "NOTICE"
   */
  type?: "ERROR" | "NOTICE";
}

const RED = 13041721;
const BLUE = 2856675;

const BASE_URL = "https://discord.com/api/v10";

export class Discord {
  private channel_id: string;
  private bot_token: string;

  constructor(channel_id: string, bot_token: string) {
    this.channel_id = channel_id;
    this.bot_token = bot_token;
  }

  async send_alert({ type = "NOTICE", ...alert }: Alert) {
    const color = type === "NOTICE" ? BLUE : RED;

    const embed = {
      author: { name: alert.from },
      description: alert.body,
      fields: alert.fields,
      color,
    };
    const payload = {
      content: type === "NOTICE" ? alert.title : `ERROR:${alert.title}`,
      embeds: [embed],
    };

    const res = await global.fetch(
      `${BASE_URL}/channels/${this.channel_id}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bot ${this.bot_token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`discord ${res.status}: ${body}`);
    }

    return res;
  }
}
