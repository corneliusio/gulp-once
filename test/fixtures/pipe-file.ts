// Pushes one file through gulp-once in a fresh process and prints how many
// files were emitted, so tests can verify persistence across real runs.
// Usage: node pipe-file.ts <checksum-file> <file-path> <contents>
import path from 'node:path'
import once from '../../src/index.ts'

const cachefile = process.argv[2] ?? ''
const filepath = process.argv[3] ?? ''
const contents = process.argv[4] ?? ''

const stream = once({ file: cachefile })

let count = 0

stream.on('data', () => count++)
stream.on('end', () => process.stdout.write(String(count)))
stream.on('error', error => {
    process.stderr.write(String(error))
    process.exit(1)
})

stream.write({
    path: path.resolve(filepath),
    contents: Buffer.from(contents),
    isStream: () => false,
    isBuffer: () => true,
    clone() {
        return this
    },
})

stream.end()
