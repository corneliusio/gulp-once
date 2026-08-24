import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Transform } from 'node:stream'

export interface FileLike {
    path: string
    contents: unknown
    isStream(): boolean
    isBuffer(): boolean
    clone(): FileLike
}

export type Namespace = string | false | ((file: FileLike) => string | false)

export interface OnceOptions {
    context?: string | false
    namespace?: Namespace
    algorithm?: string
    file?: string | false
    fileIndent?: number
}

export class GulpOnceError extends Error {
    readonly plugin = 'gulp-once'

    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'GulpOnceError'
    }
}

type Bucket = Map<string, string>
type Cache = Map<string, string | Bucket>

// In-memory cache state shared by instances pointed at the same checksum
// file, so parallel tasks writing to one file merge instead of clobbering.
const caches = new Map<string, Cache>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const toError = (value: unknown) => (value instanceof Error ? value : new Error(String(value)))

// caches written by v2 on Windows used backslash keys; keys are now
// slash-normalized on every platform
const migrateKey = (key: string) => (path.sep === '\\' ? key.split('\\').join('/') : key)

const parse = (json: string): Cache => {
    const cache: Cache = new Map()
    const parsed: unknown = JSON.parse(json)

    if (isRecord(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                cache.set(migrateKey(key), value)
            } else if (isRecord(value)) {
                const bucket: Bucket = new Map()

                for (const [file, checksum] of Object.entries(value)) {
                    if (typeof checksum === 'string') {
                        bucket.set(migrateKey(file), checksum)
                    }
                }

                cache.set(key, bucket)
            }
        }
    }

    return cache
}

const serialize = (cache: Cache, indent: number) => {
    const entries = [...cache].map(([key, value]): [string, unknown] => [
        key,
        value instanceof Map ? Object.fromEntries(value) : value,
    ])

    return JSON.stringify(Object.fromEntries(entries), null, indent)
}

const create = (options: OnceOptions | Namespace = {}) => {
    const settings = {
        context: process.cwd() as string | false,
        namespace: false as Namespace,
        algorithm: 'sha256',
        file: '.checksums' as string | false,
        fileIndent: 4,
        ...(typeof options === 'object' ? options : { namespace: options }),
    }

    let cache: Cache = new Map()

    const persist = () => {
        if (!settings.file) {
            return
        }

        const temp = `${settings.file}.${process.pid}.tmp`

        fs.writeFileSync(temp, serialize(cache, settings.fileIndent))
        fs.renameSync(temp, settings.file)
    }

    if (settings.file) {
        const cachekey = path.resolve(settings.file)
        const shared = caches.get(cachekey)

        if (shared) {
            cache = shared
        } else {
            try {
                if (fs.existsSync(settings.file)) {
                    const content = fs.readFileSync(settings.file, 'utf8')

                    if (content) {
                        cache = parse(content)
                    }
                } else {
                    persist()
                }
            } catch (error) {
                console.warn(
                    `gulp-once: ignoring unreadable checksum file "${settings.file}": ${toError(error).message}`,
                )
            }

            caches.set(cachekey, cache)
        }
    }

    return new Transform({
        objectMode: true,
        transform(file: FileLike, _encoding, next) {
            if (file.isStream()) {
                next(new GulpOnceError('Streams are not supported!'))

                return
            }

            if (!file.isBuffer()) {
                next(null, file)

                return
            }

            let bucket: Bucket | Cache = cache
            let checksum: string

            try {
                const namespace =
                    typeof settings.namespace === 'function'
                        ? settings.namespace(file.clone())
                        : settings.namespace

                if (namespace) {
                    const existing = cache.get(namespace)
                    const target = existing instanceof Map ? existing : new Map<string, string>()

                    cache.set(namespace, target)
                    bucket = target
                }

                checksum = hash(settings.algorithm || 'sha256', file.contents as Buffer, 'hex')
            } catch (error) {
                next(new GulpOnceError(toError(error).message, { cause: error }))

                return
            }

            const filename = (
                settings.context
                    ? path.relative(settings.context, file.path)
                    : path.basename(file.path)
            )
                .split(path.sep)
                .join('/')

            const existing = bucket.get(filename)

            if (existing instanceof Map) {
                // a namespace bucket owns this key; pass the file through
                // rather than destroying the namespace to track it
                next(null, file)

                return
            }

            if (existing === checksum) {
                next()

                return
            }

            bucket.set(filename, checksum)

            try {
                persist()
            } catch (error) {
                next(
                    new GulpOnceError(`Failed to write checksum file "${settings.file}"`, {
                        cause: error,
                    }),
                )

                return
            }

            next(null, file)
        },
    })
}

// attach the error class so CommonJS consumers can reach it — named
// exports are not accessible through require() of the callable export
const once = Object.assign(create, { GulpOnceError })

export default once
export { once as 'module.exports' }
