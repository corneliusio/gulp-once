const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const PluginError = require('plugin-error');

let oncechecksums = {};

module.exports = (options = {}) => {
    let empty = process.env.NODE_ENV === 'test' ? '' : null,
        stream = new Transform({ objectMode: true }),
        settings = {
            context: process.cwd(),
            namespace: false,
            algorithm: 'sha1',
            file: '.checksums',
            fileIndent: 4
        };

    options = (typeof options !== 'object') ? { namespace: options } : options;

    for (let key in options) {
        if (options.hasOwnProperty(key)) {
            settings[key] = options[key];
        }
    }

    if (settings.file) {
        if (!fs.existsSync(settings.file)) {
            fs.writeFileSync(settings.file, JSON.stringify({}));
        }

        try {
            let content = fs.readFileSync(settings.file, 'utf8');

            if (content) {
                oncechecksums = JSON.parse(content);
            }
        } catch (e) {
            // go on about our business
            console.log(e);
        }
    }

    // eslint-disable-next-line complexity
    stream._transform = (file, encoding, next) => {
        if (file.isStream()) {
            return next(new PluginError('gulp-once', 'Streams are not supported!'));
        }

        if (file.isStream()) {
            return next(new PluginError('gulp-once', 'Streams are not supported!'));
        }

        if (file.isBuffer()) {
            if (!!settings.namespace) {
                if (typeof settings.namespace === 'function') {
                    settings.namespace = settings.namespace(file.clone());
                }

                if (!oncechecksums[settings.namespace]) {
                    oncechecksums[settings.namespace] = {};
                }
            }

            const filename = settings.context ? path.relative(settings.context, file.path) : path.basename(file.path);
            const filechecksum = crypto
                .createHash(settings.algorithm || 'sha1')
                .update(file.contents.toString('utf8'))
                .digest('hex');

            if (settings.namespace in oncechecksums) {
                if (oncechecksums[settings.namespace][filename] === filechecksum) {
                    return next(null, empty);
                }

                oncechecksums[settings.namespace][filename] = filechecksum;
            } else {
                if (oncechecksums[filename] === filechecksum) {
                    return next(null, empty);
                }

                oncechecksums[filename] = filechecksum;
            }

            if (settings.file) {
                try {
                    fs.writeFileSync(settings.file, JSON.stringify(oncechecksums, null, settings.fileIndent));
                } catch (e) {
                    return next(new PluginError('gulp-once', e, { showStack: true }));
                }
            }
        }

        next(null, file);
    };

    return stream;
};
