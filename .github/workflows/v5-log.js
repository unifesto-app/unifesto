// See v5-log.yml. Reads PR + BODY from env, edits docs/version-5.md in place.
const fs = require('fs');

const file = 'docs/version-5.md';
const pr = process.env.PR;
const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
let doc = fs.readFileSync(file, 'utf8');
// A PR already logged (a re-run, a run that woke up late, or a hand-written line)
// isn't logged twice. Status updates below are idempotent anyway.
const logged = new RegExp(`^- \\*\\*\\d{4}-\\d{2}-\\d{2}\\*\\* · .* \\(#${pr}\\)$`, 'm').test(doc);

for (const line of (process.env.BODY || '').split(/\r?\n/)) {
  let m;
  if ((m = line.match(/^Log:\s*(.+)/))) {
    if (logged) console.log(`#${pr} is already in the log; skipping its Log line`);
    else doc = doc.replace(/\n*$/, '\n') + `- **${date}** · ${m[1].trim()} (#${pr})\n`;
  } else if ((m = line.match(/^Status:\s*([A-Z]+\d+)\s+(.+)/))) {
    // Last cell of the item's row in its track table: | A28 | ... | <status> |
    const row = new RegExp(`^(\\| ${m[1]} \\|.*\\| )[^|]*( \\|)$`, 'm');
    if (row.test(doc)) doc = doc.replace(row, (_, a, b) => `${a}${m[2].trim()} (#${pr})${b}`);
    else console.log(`::warning::no row for ${m[1]} in ${file}`);
  }
}

fs.writeFileSync(file, doc);
