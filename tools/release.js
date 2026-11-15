#!/usr/bin/env node
/*
 * Bump the game version before publishing, so installed copies pick up the update.
 *   node tools/release.js          -> 1.1.0 becomes 1.1.1
 *   node tools/release.js minor    -> 1.1.0 becomes 1.2.0
 *   node tools/release.js 2.0.0    -> set an exact version
 * Updates APP_VERSION in js/app.js and VERSION in sw.js (the change to sw.js is what tells
 * players' browsers that a new version exists).
 */
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const appPath = path.join(root, 'js', 'app.js'), swPath = path.join(root, 'sw.js');
let app = fs.readFileSync(appPath, 'utf8'), sw = fs.readFileSync(swPath, 'utf8');
const cur = (app.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/) || []).slice(1).map(Number);
if (cur.length !== 3) { console.error('Could not find APP_VERSION in js/app.js'); process.exit(1); }
const arg = process.argv[2] || 'patch';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) next = arg;
else if (arg === 'major') next = `${cur[0] + 1}.0.0`;
else if (arg === 'minor') next = `${cur[0]}.${cur[1] + 1}.0`;
else next = `${cur[0]}.${cur[1]}.${cur[2] + 1}`;
app = app.replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${next}'`);
sw = sw.replace(/const VERSION = '[^']*'/, `const VERSION = 'chromadock-${next}'`);
fs.writeFileSync(appPath, app); fs.writeFileSync(swPath, sw);
console.log(`Version ${cur.join('.')} -> ${next}. Commit and push to publish.`);
