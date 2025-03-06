import { readFileSync, existsSync } from "fs";

// load first file that exists
const optionsFile = ["./options-dev.json", "/data/options.json"].find(
  existsSync,
);
export const isAddOn = optionsFile === "/data/options.json";
const options = JSON.parse(readFileSync(optionsFile));

export const hassUrl = isAddOn
  ? "http://homeassistant:8123"
  : options.home_assistant_url;
export const hassToken = options.access_token;
export const debug = false;
