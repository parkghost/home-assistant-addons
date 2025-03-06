import { readFileSync, existsSync } from "fs";

// load first file that exists
const optionsFile = ["./options-dev.json", "/data/options.json"].find(
  existsSync,
);
export const isAddOn = optionsFile === "/data/options.json";
const options = JSON.parse(readFileSync(optionsFile));

export const hassUrl = isAddOn
  ? "http://homeassistant.local:8123"
  : options.hassUrl;
export const hassToken = options.hassToken;
export const debug = false;
