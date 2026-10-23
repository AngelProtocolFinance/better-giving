import { Slack } from "@/slack";
import { slack_channels } from "@/slack-channels";
import { slack } from "../env";

const bot = (channel_id: string) => new Slack(channel_id, slack.bot_token);

export const aws_monitor = bot(slack_channels.aws_monitor);
export const fiat_monitor = bot(slack_channels.fiat_monitor);
export const bg_sales = bot(slack_channels.bg_sales);
