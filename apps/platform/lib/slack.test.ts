import { afterEach, describe, expect, test, vi } from "vitest";
import { Slack } from "./slack";

const TOKEN = "xoxb-test-token";
const CHANNEL = "C0CBGUJ20KC";

function posted() {
  const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
  const headers = new Headers(init?.headers);
  return {
    url: String(url),
    method: init?.method,
    authorization: headers.get("authorization"),
    content_type: headers.get("content-type"),
    body: JSON.parse(String(init?.body)) as {
      channel: string;
      attachments: { color: string; blocks: unknown[] }[];
    },
  };
}

function mock_fetch(response: () => Response) {
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(response())
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Slack.send_alert", () => {
  test("posts a notice to chat.postMessage", async () => {
    mock_fetch(() => Response.json({ ok: true }));
    await new Slack(CHANNEL, TOKEN).send_alert({
      from: "grants-processor:staging",
      title: "No grants to process",
      body: "No grants to process for staging",
      fields: [
        { name: "amount", value: "12.5", inline: true },
        { name: "ref_id", value: "ref-1" },
      ],
    });

    const req = posted();
    expect(req.url).toBe("https://slack.com/api/chat.postMessage");
    expect(req.method).toBe("POST");
    expect(req.authorization).toBe(`Bearer ${TOKEN}`);
    expect(req.content_type).toBe("application/json");
    expect(req.body).toEqual({
      channel: CHANNEL,
      attachments: [
        {
          // hex of BLUE 2856675
          color: "#2b96e3",
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: "*No grants to process*" },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "No grants to process for staging",
              },
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: "*amount*\n12.5" },
                { type: "mrkdwn", text: "*ref_id*\nref-1" },
              ],
            },
            {
              type: "context",
              elements: [{ type: "mrkdwn", text: "grants-processor:staging" }],
            },
          ],
        },
      ],
    });
  });

  test("posts an error in red with the title prefixed ERROR:", async () => {
    mock_fetch(() => Response.json({ ok: true }));
    await new Slack(CHANNEL, TOKEN).send_alert({
      type: "ERROR",
      from: "chariot-webhook:staging",
      title: "Chariot Grant Without A Donation",
      body: "grant arrived with no donation row",
    });

    const req = posted();
    const attachment = req.body.attachments[0]!;
    expect(attachment.color).toBe("#c70039");
    expect(attachment.blocks[0]).toEqual({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*ERROR:Chariot Grant Without A Donation*",
      },
    });
  });

  test("omits body and field sections when they are absent", async () => {
    mock_fetch(() => Response.json({ ok: true }));
    await new Slack(CHANNEL, TOKEN).send_alert({
      from: "owed notices",
      title: "No grants to process",
    });

    const blocks = posted().body.attachments[0]!.blocks;
    expect(blocks).toEqual([
      {
        type: "section",
        text: { type: "mrkdwn", text: "*No grants to process*" },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "owed notices" }],
      },
    ]);

    await new Slack(CHANNEL, TOKEN).send_alert({
      from: "owed notices",
      title: "No grants to process",
      fields: [],
    });
    const with_empty_fields = vi.mocked(globalThis.fetch).mock.calls[1]!;
    const empty_body = JSON.parse(String(with_empty_fields[1]?.body)) as {
      attachments: { blocks: { type: string; fields?: unknown }[] }[];
    };
    expect(empty_body.attachments[0]!.blocks.map((b) => b.type)).toEqual([
      "section",
      "context",
    ]);
  });

  test("throws the http status when slack does not answer ok", async () => {
    mock_fetch(() =>
      Response.json({ ok: false, error: "internal_error" }, { status: 503 })
    );
    await expect(
      new Slack(CHANNEL, TOKEN).send_alert({
        from: "owed notices",
        title: "No grants to process",
      })
    ).rejects.toThrow("503");
  });

  test("throws slack's error when the body is ok false", async () => {
    mock_fetch(() => Response.json({ ok: false, error: "invalid_auth" }));
    await expect(
      new Slack(CHANNEL, TOKEN).send_alert({
        from: "owed notices",
        title: "No grants to process",
      })
    ).rejects.toThrow("invalid_auth");
  });

  test("resolves when slack answers ok", async () => {
    mock_fetch(() => Response.json({ ok: true }));
    await expect(
      new Slack(CHANNEL, TOKEN).send_alert({
        from: "owed notices",
        title: "No grants to process",
      })
    ).resolves.toBeInstanceOf(Response);
  });
});
