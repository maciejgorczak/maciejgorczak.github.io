// Writes film/timeline.json from film.js, so the score and the sheets read the same beats.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timeline} from '../film.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../film');
fs.mkdirSync(dir, {recursive: true});
fs.writeFileSync(path.join(dir, 'timeline.json'), JSON.stringify(timeline(), null, 1) + '\n');
console.log('wrote', path.join(dir, 'timeline.json'));
