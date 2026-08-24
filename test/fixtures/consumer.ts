// Typechecked against the built package (self-reference resolves through
// package.json "exports" to dist/index.d.ts) — see tsconfig.consumer.json.
import once, { GulpOnceError, type OnceOptions } from 'gulp-once'

const options: OnceOptions = {
    namespace: file => file.path,
    algorithm: 'sha256',
    file: '.checksums',
}

const stream = once(options)

stream.on('error', (error: unknown) => {
    if (error instanceof GulpOnceError) {
        console.log(error.plugin)
    }
})

console.log(typeof once.GulpOnceError, stream.writable)
