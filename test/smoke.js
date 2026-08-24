// Framework-free smoke test so CI can verify the runtime still works on
// old Node versions (node:test requires Node 18+). Run: node test/smoke.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const once = require('../');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-once-smoke-'));
const checksums = path.join(tmp, '.checksums');

const makeFile = (filepath, contents) => ({
    path: path.resolve(filepath),
    contents: Buffer.from(contents),
    isStream: () => false,
    isBuffer: () => true,
    clone() {
        return this;
    }
});

const stream = once({ file: checksums });
const output = [];

stream.on('data', (data) => output.push(data));

stream.on('end', () => {
    assert.strictEqual(output.length, 1, 'unchanged file should be filtered');

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.strictEqual(content['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');

    console.log('smoke test passed on node ' + process.version);
});

stream.write(makeFile('path/to/file.txt', 'Hello, world.'));
stream.write(makeFile('path/to/file.txt', 'Hello, world.'));
stream.end();
