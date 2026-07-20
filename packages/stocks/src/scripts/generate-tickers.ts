import fs from "node:fs";
import path from "node:path";
import { finnhub_api_key, finnhub_base_url } from "./env.ts";

const today = new Date().toISOString().split("T")[0];
const output_dir = "./src/generated";
const meta_file = path.join(output_dir, ".tickers-meta.json");
const tickers_file = path.join(output_dir, "tickers.json");

// check if today's data already exists
if (fs.existsSync(meta_file)) {
  const meta = JSON.parse(fs.readFileSync(meta_file, "utf-8"));
  if (meta.day === today) {
    console.log(`✓ Tickers for ${today} already exist, skipping fetch`);
    process.exit(0);
  }
}

console.log("Fetching stock symbols from Finnhub API...");
const res = await fetch(
  `${finnhub_base_url}/api/v1/stock/symbol?exchange=US&token=${finnhub_api_key}`
);
if (!res.ok) throw res;
const data = await res
  .json()
  .then((x) => x as { description: string; symbol: string }[]);
console.info(`Received ${data.length} stock symbols`);

// stream to file
console.info(`Writing tickers to ${tickers_file}...`);
fs.mkdirSync(output_dir, { recursive: true });
const stream = fs.createWriteStream(tickers_file, { flags: "w" });
stream.write("[\n");
for (let index = 0; index < data.length; index++) {
  const ticker = data[index];
  const line = `  ${JSON.stringify({
    symbol: ticker.symbol,
    name: ticker.description,
  })}`;
  stream.write(line);
  if (index < data.length - 1) {
    stream.write(",\n");
  } else {
    stream.write("\n");
  }

  // log progress every 1000 symbols
  if ((index + 1) % 1000 === 0) {
    console.info(`Progress: ${index + 1}/${data.length} symbols written`);
  }
}
stream.write("]\n");
await new Promise<void>((resolve, reject) => {
  stream.on("finish", resolve);
  stream.on("error", reject);
  stream.end();
});

// write meta file with generation date
fs.writeFileSync(
  meta_file,
  JSON.stringify({ day: today, count: data.length }, null, 2)
);
console.info(
  `✓ Successfully wrote ${data.length} stock symbols to ${tickers_file}`
);
