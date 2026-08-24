const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough } = require('stream');
const { finished } = require('stream/promises');
const { execFileSync } = require('child_process');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const gulp = require('gulp');
const File = require('vinyl');
const once = require('../');

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-once-')));

const checksumFile = (name) => path.join(tmp, name);

const makeFile = (filepath, contents) => new File({
    path: path.resolve(filepath),
    contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents)
});

// Write files through a stream, end it, and resolve with everything it emitted.
const run = (stream, files) => new Promise((resolve, reject) => {
    const output = [];

    stream.on('data', (data) => output.push(data));
    stream.on('error', reject);
    stream.on('end', () => resolve(output));

    files.forEach((file) => stream.write(file));
    stream.end();
});

test('adds new files to checksum list', async () => {
    const checksums = checksumFile('c1');

    await run(once({ file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.equal(content['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
});

test('filters out unchanged files', async () => {
    const checksums = checksumFile('c2');
    const file = makeFile('path/to/file.txt', 'Hello, world.');

    const output = await run(once({ file: checksums }), [file, file]);

    assert.equal(output.length, 1);
    assert.equal(output[0], file);
});

test('allows changed files through', async () => {
    const checksums = checksumFile('c3');
    const stream = once({ file: checksums });
    const output = [];

    stream.on('data', (data) => output.push(data.contents.toString('utf8')));

    const file = makeFile('path/to/file.txt', 'Hello, world.');

    await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', resolve);

        stream.write(file);
        file.contents = Buffer.from('Hello, universe.');
        stream.write(file);
        stream.end();
    });

    assert.deepEqual(output, ['Hello, world.', 'Hello, universe.']);
});

test('can disable context', async () => {
    const checksums = checksumFile('c4');

    await run(once({ context: false, file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.equal(content['file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
});

test('can set namespace for files', async () => {
    const checksums = checksumFile('c5');

    await run(once({ namespace: 'foobar', file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.equal(content.foobar['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
});

test('passes non-object options through as namespace', async () => {
    const cwd = process.cwd();

    process.chdir(tmp);

    try {
        await run(once('images'), [makeFile(path.join(tmp, 'file.txt'), 'Hello, world.')]);

        const content = JSON.parse(fs.readFileSync(path.join(tmp, '.checksums'), 'utf8'));

        assert.equal(content.images['file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
    } finally {
        process.chdir(cwd);
    }
});

test('calls dynamic namespace function for every file', async () => {
    const checksums = checksumFile('c6');
    const seen = [];

    const stream = once({
        namespace(file) {
            const namespace = path.extname(file.path).replace(/^\./, '');

            seen.push(namespace);

            return namespace;
        },
        file: checksums
    });

    await run(stream, [
        makeFile('path/to/style.css', 'a { color: red; }'),
        makeFile('path/to/script.js', 'console.log(1);')
    ]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.deepEqual(seen, ['css', 'js']);
    assert.ok(content.css['path/to/style.css']);
    assert.ok(content.js['path/to/script.js']);
});

test('can set alternate hashing algorithm', async () => {
    const checksums = checksumFile('c7');

    await run(once({ algorithm: 'sha256', file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.equal(content['path/to/file.txt'], 'f8c3bf62a9aa3e6fc1619c250e48abe7519373d3edf41be62eb5dc45199af2ef');
});

test('emits a plugin error for an unknown algorithm', async () => {
    const stream = once({ algorithm: 'not-a-real-hash', file: false });

    await assert.rejects(run(stream, [makeFile('path/to/file.txt', 'Hello, world.')]), (error) => {
        assert.equal(error.plugin, 'gulp-once');

        return true;
    });
});

test('hashes buffers directly so distinct binary content is distinct', async () => {
    const checksums = checksumFile('c-binary');
    const stream = once({ file: checksums });
    const output = [];

    stream.on('data', (data) => output.push(data));

    // 0x80 and 0x81 are both invalid UTF-8 and used to collapse to the same hash
    await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', resolve);

        const file = makeFile('path/to/image.bin', Buffer.from([0x80]));

        stream.write(file);
        file.contents = Buffer.from([0x81]);
        stream.write(file);
        stream.end();
    });

    assert.equal(output.length, 2);
});

test('a namespace of __proto__ does not pollute Object.prototype', async () => {
    const checksums = checksumFile('c-proto');

    await run(once({ namespace: '__proto__', file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    const probe = {};

    assert.equal(probe['path/to/file.txt'], undefined);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.ok(Object.prototype.hasOwnProperty.call(content, '__proto__'));
});

test('recovers from a malformed checksum file', async () => {
    const checksums = checksumFile('c-malformed');

    fs.writeFileSync(checksums, 'not json{');

    const output = await run(once({ file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    assert.equal(output.length, 1);
    assert.ok(JSON.parse(fs.readFileSync(checksums, 'utf8'))['path/to/file.txt']);
});

test('ignores structurally invalid checksum data', async () => {
    const checksums = checksumFile('c-invalid');

    fs.writeFileSync(checksums, JSON.stringify([1, 2, 3]));

    const output = await run(once({ file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    assert.equal(output.length, 1);
});

test('instances do not share state', async () => {
    const checksumsA = checksumFile('c-iso-a');
    const checksumsB = checksumFile('c-iso-b');
    const file = makeFile('path/to/file.txt', 'Hello, world.');

    await run(once({ file: checksumsA }), [file]);

    const streamA = once({ file: checksumsA });

    // constructing a second instance must not redirect or clobber the first cache
    const streamB = once({ file: checksumsB });

    const outputA = await run(streamA, [file]);
    const outputB = await run(streamB, [file]);

    assert.equal(outputA.length, 0, 'first cache still filters its own file');
    assert.equal(outputB.length, 1, 'second cache has never seen the file');
});

test('instances sharing a checksum file merge their writes', async () => {
    const checksums = checksumFile('c-shared');

    const styles = once({ namespace: 'styles', file: checksums });
    const scripts = once({ namespace: 'scripts', file: checksums });

    await Promise.all([
        run(styles, [makeFile('path/to/style.css', 'a { color: red; }')]),
        run(scripts, [makeFile('path/to/script.js', 'console.log(1);')])
    ]);

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.ok(content.styles['path/to/style.css'], 'first namespace persisted');
    assert.ok(content.scripts['path/to/script.js'], 'second namespace persisted');
});

test('stress test', async () => {
    const checksums = checksumFile('c8');
    const streams = [];
    const pending = [];

    // construct every stream up front so they all share one cache file
    for (let is = 0; is < 20; is++) {
        streams.push(once({ file: checksums }));
    }

    streams.forEach((stream, is) => {
        const files = [];

        for (let i = 0; i < 200; i++) {
            files.push(makeFile(`path/to/file-${is}-${i}.txt`, 'Hello, world.'));
        }

        pending.push(run(stream, files));
    });

    const results = await Promise.all(pending);

    results.forEach((output) => assert.equal(output.length, 200));

    const content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

    assert.equal(Object.keys(content).length, 4000, 'every checksum survived in the shared file');
});

test('loads an existing checksum file from disk', async () => {
    const checksums = checksumFile('c-preexisting');
    const key = ['path', 'to', 'file.txt'].join(path.sep);

    // keys written with platform separators exercise the Windows key
    // migration on Windows and a plain valid-cache read elsewhere
    fs.writeFileSync(checksums, JSON.stringify({
        [key]: '2ae01472317d1935a84797ec1983ae243fc6aa28'
    }));

    const output = await run(once({ file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')]);

    assert.equal(output.length, 0, 'file matching the on-disk checksum is filtered');
});

test('persists checksums across separate processes', () => {
    const fixture = path.join(__dirname, 'fixtures', 'pipe-file.js');
    const checksums = checksumFile('c-subprocess');

    const pipe = (contents) => execFileSync(process.execPath, [fixture, checksums, 'path/to/file.txt', contents], {
        encoding: 'utf8'
    });

    assert.equal(pipe('Hello, world.'), '1', 'first run emits the file');
    assert.equal(pipe('Hello, world.'), '0', 'second run reads the cache from disk and filters it');
    assert.equal(pipe('Hello, universe.'), '1', 'changed contents pass through again');
});

test('filters files in a real gulp pipeline', async () => {
    const checksums = checksumFile('c-gulp');
    const srcdir = path.join(tmp, 'gulp-src');
    const destdir = path.join(tmp, 'gulp-dest');

    fs.mkdirSync(srcdir, { recursive: true });
    fs.writeFileSync(path.join(srcdir, 'a.txt'), 'alpha');
    fs.writeFileSync(path.join(srcdir, 'b.txt'), 'beta');

    // globs always use forward slashes, including on Windows
    const glob = `${srcdir.split(path.sep).join('/')}/*.txt`;

    const runPipeline = async () => {
        const emitted = [];
        const filter = once({ file: checksums, context: srcdir });

        filter.on('data', (file) => emitted.push(path.basename(file.path)));

        await finished(gulp.src(glob).pipe(filter).pipe(gulp.dest(destdir)));

        return emitted.sort();
    };

    assert.deepEqual(await runPipeline(), ['a.txt', 'b.txt'], 'first run passes every file');
    assert.deepEqual(await runPipeline(), [], 'second run filters everything');

    fs.writeFileSync(path.join(srcdir, 'b.txt'), 'beta changed');

    assert.deepEqual(await runPipeline(), ['b.txt'], 'only the changed file passes');
    assert.ok(fs.existsSync(path.join(destdir, 'a.txt')), 'files reached gulp.dest');
});

test('rejects streamed file contents with a plugin error', async () => {
    const stream = once({ file: false });
    const file = new File({
        path: path.resolve('path/to/file.txt'),
        contents: new PassThrough()
    });

    await assert.rejects(run(stream, [file]), (error) => {
        assert.equal(error.plugin, 'gulp-once');
        assert.match(error.message, /Streams are not supported/);

        return true;
    });
});

test('passes null-content files through untouched', async () => {
    const checksums = checksumFile('c-null');
    const file = new File({ path: path.resolve('path/to/file.txt'), contents: null });

    const output = await run(once({ file: checksums }), [file]);

    assert.equal(output.length, 1);
    assert.equal(output[0], file, 'the same file object is passed through');
    assert.deepEqual(JSON.parse(fs.readFileSync(checksums, 'utf8')), {}, 'nothing is recorded for null contents');
});

test('wraps namespace function errors in a plugin error', async () => {
    const stream = once({
        namespace: () => {
            throw new Error('namespace exploded');
        },
        file: false
    });

    await assert.rejects(run(stream, [makeFile('path/to/file.txt', 'Hello, world.')]), (error) => {
        assert.equal(error.plugin, 'gulp-once');
        assert.match(error.message, /namespace exploded/);

        return true;
    });
});

test('emits a plugin error when the checksum file cannot be written', async () => {
    const checksums = path.join(tmp, 'no-such-dir', 'checksums');
    const stream = once({ file: checksums });

    await assert.rejects(run(stream, [makeFile('path/to/file.txt', 'Hello, world.')]), (error) => {
        assert.equal(error.plugin, 'gulp-once');
        assert.match(error.message, /ENOENT/, 'the write failure is surfaced');

        return true;
    });
});
