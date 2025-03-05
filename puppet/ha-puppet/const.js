import { readFileSync } from 'fs';

export const options = JSON.parse(readFileSync('/data/options.json'));
