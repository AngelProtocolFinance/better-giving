import { Discord } from "@/discord";
import { discord_channels } from "@/discord-channels";
import { discord } from "../env";

const bot = (channel_id: string) => new Discord(channel_id, discord.bot_token);

export const aws_monitor = bot(discord_channels.aws_monitor);
export const fiat_monitor = bot(discord_channels.fiat_monitor);
export const bg_sales = bot(discord_channels.bg_sales);
