const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const PluginError = require('plugin-error');

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// In-memory cache state shared by instances pointed at the same checksum
// file, so parallel tasks writing to one file merge instead of clobbering.
const caches = new Map();

// v2.1 caches written on Windows used backslash keys; keys are now
// slash-normalized on every platform.
const migrateKey = (key) => (path.sep === '\\' ? key.split('\\').join('/') : key);

// Copy parsed JSON into null-prototype records so keys like "__proto__" are
// plain data properties and can never reach Object.prototype.
const sanitize = (parsed) => {
    const cache = Object.create(null);

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach((key) => {
            const value = parsed[key];

            if (typeof value === 'string') {
                cache[migrateKey(key)] = value;
            } else if (value && typeof value === 'object' && !Array.isArray(value)) {
                const bucket = Object.create(null);

                Object.keys(value).forEach((nested) => {
                    if (typeof value[nested] === 'string') {
                        bucket[migrateKey(nested)] = value[nested];
                    }
                });

                cache[key] = bucket;
            }
        });
    }

    return cache;
};

module.exports = (options = {}) => {
    let checksums = Object.create(null);

    const stream = new Transform({ objectMode: true });
    const settings = Object.assign(Object.create(null), {
        context: process.cwd(),
        namespace: false,
        algorithm: 'sha1',
        file: '.checksums',
        fileIndent: 4
    });

    options = (!options || typeof options !== 'object') ? { namespace: options } : options;

    for (const key in options) {
        if (hasOwn(options, key)) {
            settings[key] = options[key];
        }
    }

    // Write to a temp file, then rename so a crash can't leave truncated JSON.
    const persist = () => {
        const temp = `${settings.file}.${process.pid}.tmp`;

        fs.writeFileSync(temp, JSON.stringify(checksums, null, settings.fileIndent));
        fs.renameSync(temp, settings.file);
    };

    if (settings.file) {
        const cachekey = path.resolve(settings.file);

        if (caches.has(cachekey)) {
            checksums = caches.get(cachekey);
        } else {
            try {
                if (fs.existsSync(settings.file)) {
                    const content = fs.readFileSync(settings.file, 'utf8');

                    if (content) {
                        checksums = sanitize(JSON.parse(content));
                    }
                } else {
                    persist();
                }
            } catch (e) {
                // unreadable or malformed cache; start fresh
                console.log(e);
            }

            caches.set(cachekey, checksums);
        }
    }

    stream._transform = (file, encoding, next) => {
        if (file.isStream()) {
            return next(new PluginError('gulp-once', 'Streams are not supported!'));
        }

        if (file.isBuffer()) {
            let bucket = checksums;
            let filechecksum;

            try {
                let namespace = settings.namespace;

                if (typeof namespace === 'function') {
                    namespace = namespace(file.clone());
                }

                if (namespace) {
                    if (!hasOwn(checksums, namespace) || typeof checksums[namespace] !== 'object') {
                        checksums[namespace] = Object.create(null);
                    }

                    bucket = checksums[namespace];
                }

                filechecksum = crypto
                    .createHash(settings.algorithm || 'sha1')
                    .update(file.contents)
                    .digest('hex');
            } catch (e) {
                return next(new PluginError('gulp-once', e, { showStack: true }));
            }

            const filename = (settings.context
                ? path.relative(settings.context, file.path)
                : path.basename(file.path)).split(path.sep).join('/');

            if (bucket[filename] === filechecksum) {
                return next();
            }

            bucket[filename] = filechecksum;

            if (settings.file) {
                try {
                    persist();
                } catch (e) {
                    return next(new PluginError('gulp-once', e, { showStack: true }));
                }
            }
        }

        next(null, file);
    };

    return stream;
};
