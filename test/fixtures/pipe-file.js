// Pushes one file through gulp-once in a fresh process and prints how many
// files were emitted, so tests can verify persistence across real runs.
// Usage: node pipe-file.js <checksum-file> <file-path> <contents>
const path = require('path');
const once = require('../../');

const cachefile = process.argv[2];
const filepath = process.argv[3];
const contents = process.argv[4];

const stream = once({ file: cachefile });

let count = 0;

stream.on('data', () => count++);
stream.on('end', () => process.stdout.write(String(count)));
stream.on('error', (e) => {
    process.stderr.write(String(e));
    process.exit(1);
});

stream.write({
    path: path.resolve(filepath),
    contents: Buffer.from(contents),
    isStream: () => false,
    isBuffer: () => true,
    clone() {
        return this;
    }
});

stream.end();
