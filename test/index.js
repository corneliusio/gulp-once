const fs = require('fs');
const test = require('ava');
const path = require('path');
const File = require('vinyl');
const once = require('../');

test('adds new files to checksum list', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c1');
    const stream = once({ file: checksums });
    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        t.true(fs.existsSync(checksums));

        try {
            let content = fs.readFileSync(checksums, 'utf8');

            t.truthy(content);
            t.is(JSON.parse(content)['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
            fs.unlinkSync(checksums);
        } catch (e) {
            t.fail(e);
        }

        done();
    });

    stream.write(file);
}));

test('filters out unchanged files', t => new Promise(done => {

    const checksums = path.resolve(__dirname, '.c2');
    const stream = once({ file: checksums });
    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        t.is(data, file);

        stream.once('data', data => {
            t.is(data, '');

            fs.unlinkSync(checksums);
            done();
        });

        stream.write(file);
    });

    stream.write(file);
}));

test('allows changed files through', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c3');
    const stream = once({ file: checksums });
    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        t.is(data.contents.toString('utf8'), 'Hello, world.');
        t.is(data, file);

        stream.once('data', data => {
            t.is(data.contents.toString('utf8'), 'Hello, universe.');
            t.is(data, file);

            fs.unlinkSync(checksums);
            done();
        });

        file.contents = Buffer.from('Hello, universe.');
        stream.write(file);
    });

    stream.write(file);
}));

test('can disable context', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c4');

    const stream = once({
        context: false,
        file: checksums
    });

    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        try {
            let content = fs.readFileSync(checksums, 'utf8');

            t.is(JSON.parse(content)['file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
            fs.unlinkSync(checksums);
        } catch (e) {
            t.fail(e);
        }

        done();
    });

    stream.write(file);
}));

test('can set namespace for files', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c5');

    const stream = once({
        namespace: 'foobar',
        file: checksums
    });

    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        try {
            let content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

            t.truthy(content.foobar);
            t.is(content.foobar['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
            fs.unlinkSync(checksums);
        } catch (e) {
            t.fail(e);
        }

        done();
    });

    stream.write(file);
}));

test('can set dynamic namespaces with function', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c6');

    const stream = once({
        namespace(file) {
            return path.extname(file.path).replace(/^\./, '');
        },
        file: checksums
    });

    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        try {
            let content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

            t.truthy(content.txt);
            t.is(content.txt['path/to/file.txt'], '2ae01472317d1935a84797ec1983ae243fc6aa28');
            fs.unlinkSync(checksums);
        } catch (e) {
            t.fail(e);
        }

        done();
    });

    stream.write(file);
}));

test('can set alternate hashing algorithm', t => new Promise(done => {
    const checksums = path.resolve(__dirname, '.c7');

    const stream = once({
        algorithm: 'sha256',
        file: checksums
    });

    const file = new File({
        path: 'path/to/file.txt',
        contents: Buffer.from('Hello, world.')
    });

    stream.once('data', data => {
        try {
            let content = JSON.parse(fs.readFileSync(checksums, 'utf8'));

            t.is(content['path/to/file.txt'], 'f8c3bf62a9aa3e6fc1619c250e48abe7519373d3edf41be62eb5dc45199af2ef');
            fs.unlinkSync(checksums);
        } catch (e) {
            t.fail(e);
        }

        done();
    });

    stream.write(file);
}));

test('stress test', t => new Promise(done => {
    let finished = 0;
    const checksums = path.resolve(__dirname, '.c8');

    for (let is = 0, ls = 20; is < ls; is++) {
        let filtered = 0;
        const stream = once({ file: checksums });

        stream.on('data', data => {
            filtered++;

            if (filtered === 200) {
                finished++;
            }

            if (finished === 20) {
                fs.unlinkSync(checksums);
                t.pass();
                done();
            }
        });

        for (let i = 0, l = 200; i < l; i++) {
            stream.write(new File({
                path: `path/to/file-${is}-${i}.txt`,
                contents: Buffer.from('Hello, world.')
            }));
        }
    }
}));
