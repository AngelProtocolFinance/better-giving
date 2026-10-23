// https://docs.slack.dev/reference/methods/chat.postMessage
// header plain_text is 150 characters. grant titles include npos.name
// (text, no length cap in .server/pg/schema/npo.ts), so a header can be rejected.

export interface Field {
  name: string;
  value: string;
  inline?: true;
}

export interface Alert {
  /** context block: the sender identity every caller sets */
  from: string;
  /** mrkdwn section */
  title: string;
  /** mrkdwn section */
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

const POST_MESSAGE = "https://slack.com/api/chat.postMessage";

export class Slack {
  private channel_id: string;
  private bot_token: string | undefined;

  constructor(channel_id: string, bot_token: string | undefined) {
    this.channel_id = channel_id;
    this.bot_token = bot_token;
  }

  async send_alert({ type = "NOTICE", ...alert }: Alert) {
    const visible = type === "NOTICE" ? alert.title : `ERROR:${alert.title}`;
    const color = type === "NOTICE" ? BLUE : RED;
    const blocks: Block[] = [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${visible}*` },
      },
    ];
    if (alert.body) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: alert.body },
      });
    }
    if (alert.fields?.length) {
      blocks.push({
        type: "section",
        fields: alert.fields.map((f) => ({
          type: "mrkdwn",
          text: `*${f.name}*\n${f.value}`,
        })),
      });
    }
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: alert.from }],
    });

    const res = await global.fetch(POST_MESSAGE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${this.bot_token}`,
      },
      body: JSON.stringify({
        channel: this.channel_id,
        attachments: [
          { color: `#${color.toString(16).padStart(6, "0")}`, blocks },
        ],
      }),
    });
    const failure = await refusal(res);
    if (failure) throw failure;
    return res;
  }
}

type Text = { type: "mrkdwn"; text: string };
type Block =
  | { type: "section"; text: Text }
  | { type: "section"; fields: Text[] }
  | { type: "context"; elements: Text[] };

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** `chat.postMessage` answers HTTP 200 with `{ ok: false }` for a refused post. */
async function refusal(res: Response): Promise<Error | undefined> {
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return new Error(
      res.ok
        ? "slack: response was not json"
        : `slack ${res.status}: response was not json`
    );
  }
  if (res.ok && is_record(json) && json.ok === true) return;
  const error =
    is_record(json) && typeof json.error === "string" ? json.error : undefined;
  const detail = [!res.ok ? String(res.status) : undefined, error]
    .filter((part): part is string => part !== undefined)
    .join(": ");
  return new Error(detail ? `slack ${detail}` : "slack: not ok");
}
