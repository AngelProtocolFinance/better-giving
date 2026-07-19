/**
 * This ascii text file contains the Central Index Key (CIK) numbers, company names, SEC reporting file numbers, and addresses (business addresses are provided when mailing addresses are not available) of active broker-dealers who are registered with the SEC.

The information in this file is raw data — data that is meant to be used as input to another program. The data items are provided as a "tab delimited" file. Although the file can be viewed in any program that accepts ASCII text (for example, a word processor), the data fields are best viewed when imported into a program that accepts delimited data, such as a spreadsheet. The record layout and maximum field sizes are shown below for those who want to process the data into another form.

Field Name	Maximum Size
CIK NUMBER	10 characters
COMPANY NAME	60 characters
REPORTING FILE NUMBER  	25 characters
ADDRESS1	40 characters
ADDRESS2	40 characters
CITY	30 characters
STATE CODE	2 characters
ZIP CODE	10 characters

 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

function get_previous_month_url(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed, current month

  // get previous month
  if (month === 0) {
    month = 11; // december of previous year
  } else {
    month = month - 1;
  }

  const month_str = String(month + 1).padStart(2, "0");
  const day = "01";
  const year_str = String(year).slice(-2);

  const filename = `bd${month_str}${day}${year_str}.txt`;
  return `https://www.sec.gov/files/data/broker-dealers/company-information-about-active-broker-dealers/${filename}`;
}

function get_previous_month_string(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  // get previous month
  if (month === 0) {
    return `${year - 1}-12`;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

const SEC_URL = get_previous_month_url();

async function fetch_broker_data() {
  console.log(`Fetching broker-dealer data from SEC: ${SEC_URL}`);

  const response = await fetch(SEC_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch broker data: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  const decoder = new TextDecoder("utf-16le");
  const text = decoder.decode(buffer);
  return text;
}

function parse_broker_data(text: string): string[] {
  const lines = text.split("\n");
  const brokers: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const fields = line.split("\t");
    if (fields.length < 2) continue;

    const company_name = fields[1]?.trim();
    if (company_name && company_name !== "COMPANY NAME") {
      brokers.push(company_name);
    }
  }

  return brokers;
}

async function main() {
  try {
    const raw_data = await fetch_broker_data();
    const brokers = parse_broker_data(raw_data);

    console.log(`Parsed ${brokers.length} broker-dealers`);

    const output_dir = join(process.cwd(), "src", "generated");

    writeFileSync(
      join(output_dir, "brokers.json"),
      JSON.stringify(brokers, null, 2)
    );
    console.log("✓ Saved brokers.json");

    const month = get_previous_month_string();

    writeFileSync(
      join(output_dir, "brokers-meta.json"),
      JSON.stringify({ month }, null, 2)
    );
    console.log("✓ Saved brokers-meta.json");

    console.log(`\nSuccessfully generated broker data for ${month}`);
  } catch (error) {
    console.error("Error generating broker data:", error);
    process.exit(1);
  }
}

main();
