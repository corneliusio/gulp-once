import assert from 'node:assert/strict'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Transform } from 'node:stream'
import { test } from 'node:test'
import File from 'vinyl'
import once, { GulpOnceError } from '../src/index.ts'

const SHA256_HELLO = 'f8c3bf62a9aa3e6fc1619c250e48abe7519373d3edf41be62eb5dc45199af2ef'
const SHA1_HELLO = '2ae01472317d1935a84797ec1983ae243fc6aa28'

const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gulp-once-')))

const checksumFile = (name: string) => path.join(tmp, name)

const makeFile = (filepath: string, contents: Buffer | string) =>
    new File({
        path: path.resolve(filepath),
        contents: Buffer.isBuffer(contents) ? contents : Buffer.from(contents),
    })

const readCache = (checksums: string) =>
    JSON.parse(fs.readFileSync(checksums, 'utf8')) as Record<
        string,
        string | Record<string, string>
    >

// Write files through a stream, end it, and resolve with everything it emitted.
const run = (stream: Transform, files: File[]) =>
    new Promise<File[]>((resolve, reject) => {
        const output: File[] = []

        stream.on('data', (data: File) => output.push(data))
        stream.on('error', reject)
        stream.on('end', () => resolve(output))

        for (const file of files) {
            stream.write(file)
        }

        stream.end()
    })

test('adds new files to checksum list', async () => {
    const checksums = checksumFile('c1')

    await run(once({ file: checksums }), [makeFile('path/to/file.txt', 'Hello, world.')])

    assert.equal(readCache(checksums)['path/to/file.txt'], SHA256_HELLO)
})

test('filters out unchanged files', async () => {
    const checksums = checksumFile('c2')
    const file = makeFile('path/to/file.txt', 'Hello, world.')

    const output = await run(once({ file: checksums }), [file, file])

    assert.equal(output.length, 1)
    assert.equal(output[0], file)
})

test('allows changed files through', async () => {
    const checksums = checksumFile('c3')
    const stream = once({ file: checksums })
    const output: string[] = []

    stream.on('data', (data: File) => output.push(String(data.contents)))

    const file = makeFile('path/to/file.txt', 'Hello, world.')

    await new Promise<void>((resolve, reject) => {
        stream.on('error', reject)
        stream.on('end', resolve)

        stream.write(file)
        file.contents = Buffer.from('Hello, universe.')
        stream.write(file)
        stream.end()
    })

    assert.deepEqual(output, ['Hello, world.', 'Hello, universe.'])
})

test('can disable context', async () => {
    const checksums = checksumFile('c4')

    await run(once({ context: false, file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    assert.equal(readCache(checksums)['file.txt'], SHA256_HELLO)
})

test('can set namespace for files', async () => {
    const checksums = checksumFile('c5')

    await run(once({ namespace: 'foobar', file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    assert.deepEqual(readCache(checksums).foobar, { 'path/to/file.txt': SHA256_HELLO })
})

test('passes non-object options through as namespace', async () => {
    const cwd = process.cwd()

    process.chdir(tmp)

    try {
        await run(once('images'), [makeFile(path.join(tmp, 'file.txt'), 'Hello, world.')])

        assert.deepEqual(readCache(path.join(tmp, '.checksums')).images, {
            'file.txt': SHA256_HELLO,
        })
    } finally {
        process.chdir(cwd)
    }
})

test('calls dynamic namespace function for every file', async () => {
    const checksums = checksumFile('c6')
    const seen: string[] = []

    const stream = once({
        namespace(file) {
            const namespace = path.extname(file.path).replace(/^\./, '')

            seen.push(namespace)

            return namespace
        },
        file: checksums,
    })

    await run(stream, [
        makeFile('path/to/style.css', 'a { color: red; }'),
        makeFile('path/to/script.js', 'console.log(1);'),
    ])

    assert.deepEqual(seen, ['css', 'js'])
    assert.deepEqual(readCache(checksums), {
        css: { 'path/to/style.css': hash('sha256', 'a { color: red; }', 'hex') },
        js: { 'path/to/script.js': hash('sha256', 'console.log(1);', 'hex') },
    })
})

test('can set alternate hashing algorithm', async () => {
    const checksums = checksumFile('c7')

    await run(once({ algorithm: 'sha1', file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    assert.equal(readCache(checksums)['path/to/file.txt'], SHA1_HELLO)
})

test('emits a plugin error for an unknown algorithm', async () => {
    const stream = once({ algorithm: 'not-a-real-hash', file: false })

    await assert.rejects(
        run(stream, [makeFile('path/to/file.txt', 'Hello, world.')]),
        (error: unknown) => {
            assert.ok(error instanceof GulpOnceError)
            assert.equal(error.plugin, 'gulp-once')

            return true
        },
    )
})

test('hashes buffers directly so distinct binary content is distinct', async () => {
    const checksums = checksumFile('c-binary')
    const stream = once({ file: checksums })
    const output: File[] = []

    stream.on('data', (data: File) => output.push(data))

    // 0x80 and 0x81 are both invalid UTF-8; hashing decoded strings would collapse them
    await new Promise<void>((resolve, reject) => {
        stream.on('error', reject)
        stream.on('end', resolve)

        const file = makeFile('path/to/image.bin', Buffer.from([0x80]))

        stream.write(file)
        file.contents = Buffer.from([0x81])
        stream.write(file)
        stream.end()
    })

    assert.equal(output.length, 2)
})

test('a namespace of __proto__ does not pollute Object.prototype', async () => {
    const checksums = checksumFile('c-proto')

    await run(once({ namespace: '__proto__', file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    const probe: Record<string, unknown> = {}

    assert.equal(probe['path/to/file.txt'], undefined)
    assert.ok(Object.hasOwn(readCache(checksums), '__proto__'))
})

test('recovers from a malformed checksum file', async () => {
    const checksums = checksumFile('c-malformed')

    fs.writeFileSync(checksums, 'not json{')

    const output = await run(once({ file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    assert.equal(output.length, 1)
    assert.ok(readCache(checksums)['path/to/file.txt'])
})

test('ignores structurally invalid checksum data', async () => {
    const checksums = checksumFile('c-invalid')

    fs.writeFileSync(checksums, JSON.stringify([1, 2, 3]))

    const output = await run(once({ file: checksums }), [
        makeFile('path/to/file.txt', 'Hello, world.'),
    ])

    assert.equal(output.length, 1)
})

test('instances do not share state', async () => {
    const checksumsA = checksumFile('c-iso-a')
    const checksumsB = checksumFile('c-iso-b')
    const file = makeFile('path/to/file.txt', 'Hello, world.')

    await run(once({ file: checksumsA }), [file])

    const streamA = once({ file: checksumsA })

    // constructing a second instance must not redirect or clobber the first cache
    const streamB = once({ file: checksumsB })

    const outputA = await run(streamA, [file])
    const outputB = await run(streamB, [file])

    assert.equal(outputA.length, 0, 'first cache still filters its own file')
    assert.equal(outputB.length, 1, 'second cache has never seen the file')
})

test('stress test', async () => {
    const checksums = checksumFile('c8')
    const streams: Promise<File[]>[] = []

    for (let is = 0; is < 20; is++) {
        const stream = once({ file: checksums })
        const files: File[] = []

        for (let i = 0; i < 200; i++) {
            files.push(makeFile(`path/to/file-${is}-${i}.txt`, 'Hello, world.'))
        }

        streams.push(run(stream, files))
    }

    const results = await Promise.all(streams)

    for (const output of results) {
        assert.equal(output.length, 200)
    }
})
