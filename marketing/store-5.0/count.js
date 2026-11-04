// Checks every field in LISTING.md against its store limit: node count.js
const md = require('fs').readFileSync(__dirname + '/LISTING.md', 'utf8');
const fields = [];
// **Label (limit):** value on one line, or a ``` block right after it
for (const m of md.matchAll(/\*\*([^*]+?) \((\d+)\):\*\*(?:\n\n```\n([\s\S]*?)\n```| (.+))/g))
  fields.push([m[1], +m[2], m[3] ?? m[4].trim()]);
let bad = 0;
for (const [label, limit, text] of fields) {
  const n = [...text].length;
  if (n > limit || /—/.test(text)) bad++;
  console.log(`${n > limit ? 'OVER' : /—/.test(text) ? 'DASH' : 'ok  '} ${String(n).padStart(4)} / ${limit}  ${label}`);
}
process.exitCode = bad ? 1 : 0;
