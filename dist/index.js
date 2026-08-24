import { hash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
export class GulpOnceError extends Error {
    plugin = 'gulp-once';
    constructor(message, options) {
        super(message, options);
        this.name = 'GulpOnceError';
    }
}
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const toError = (value) => (Error.isError(value) ? value : new Error(String(value)));
const parse = (json) => {
    const cache = new Map();
    const parsed = JSON.parse(json);
    if (isRecord(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === 'string') {
                cache.set(key, value);
            }
            else if (isRecord(value)) {
                const bucket = new Map();
                for (const [file, checksum] of Object.entries(value)) {
                    if (typeof checksum === 'string') {
                        bucket.set(file, checksum);
                    }
                }
                cache.set(key, bucket);
            }
        }
    }
    return cache;
};
const serialize = (cache, indent) => {
    const entries = [...cache].map(([key, value]) => [
        key,
        value instanceof Map ? Object.fromEntries(value) : value,
    ]);
    return JSON.stringify(Object.fromEntries(entries), null, indent);
};
const once = (options = {}) => {
    const settings = {
        context: process.cwd(),
        namespace: false,
        algorithm: 'sha256',
        file: '.checksums',
        fileIndent: 4,
        ...(typeof options === 'object' ? options : { namespace: options }),
    };
    let cache = new Map();
    const persist = () => {
        if (!settings.file) {
            return;
        }
        const temp = `${settings.file}.${process.pid}.tmp`;
        fs.writeFileSync(temp, serialize(cache, settings.fileIndent));
        fs.renameSync(temp, settings.file);
    };
    if (settings.file) {
        try {
            if (fs.existsSync(settings.file)) {
                const content = fs.readFileSync(settings.file, 'utf8');
                if (content) {
                    cache = parse(content);
                }
            }
            else {
                persist();
            }
        }
        catch (error) {
            console.warn(`gulp-once: ignoring unreadable checksum file "${settings.file}": ${toError(error).message}`);
        }
    }
    return new Transform({
        objectMode: true,
        transform(file, _encoding, next) {
            if (file.isStream()) {
                next(new GulpOnceError('Streams are not supported!'));
                return;
            }
            if (!file.isBuffer()) {
                next(null, file);
                return;
            }
            let bucket = cache;
            let checksum;
            try {
                const namespace = typeof settings.namespace === 'function'
                    ? settings.namespace(file.clone())
                    : settings.namespace;
                if (namespace) {
                    const existing = cache.get(namespace);
                    const target = existing instanceof Map ? existing : new Map();
                    cache.set(namespace, target);
                    bucket = target;
                }
                checksum = hash(settings.algorithm || 'sha256', file.contents, 'hex');
            }
            catch (error) {
                next(new GulpOnceError(toError(error).message, { cause: error }));
                return;
            }
            const filename = (settings.context
                ? path.relative(settings.context, file.path)
                : path.basename(file.path))
                .split(path.sep)
                .join('/');
            if (bucket.get(filename) === checksum) {
                next();
                return;
            }
            bucket.set(filename, checksum);
            try {
                persist();
            }
            catch (error) {
                next(new GulpOnceError(`Failed to write checksum file "${settings.file}"`, {
                    cause: error,
                }));
                return;
            }
            next(null, file);
        },
    });
};
export default once;
export { once as 'module.exports' };
//# sourceMappingURL=index.js.map