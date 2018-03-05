let fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    {Transform} = require('stream'),
    PluginError = require('plugin-error'),
    oncechecksums = {};

module.exports = function(options = {}) {

    let stream = new Transform({objectMode: true}),
        settings = {
            context: false,
            namespace: false,
            algorithm: 'sha1',
            file: '.checksums',
            fileIndent: 4
        };

    options = (typeof options === 'string') ? {namespace: options} : options;

    for (let key in options) {
        if (options.hasOwnProperty(key)) {
            settings[key] = options[key];
        }
    }

    if (settings.file) {

        if (!fs.existsSync(settings.file)) {
            fs.writeFileSync(settings.file, JSON.stringify({}, null, settings.fileIndent));
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

    if (!!settings.namespace && !oncechecksums[settings.namespace]) {
        oncechecksums[settings.namespace] = {};
    }

    stream._transform = function(file, encoding, next) {

        if (file.isBuffer()) {

            const filename = settings.context ? path.relative(settings.context, file.path) : path.basename(file.path);
            const filechecksum = crypto
                .createHash(settings.algorithm || 'sha1')
                .update(file.contents.toString('utf8'))
                .digest('hex');

            if (settings.namespace in oncechecksums) {

                if (oncechecksums[settings.namespace][filename] === filechecksum) {
                    return next();
                }

                oncechecksums[settings.namespace][filename] = filechecksum;
            } else {

                if (oncechecksums[filename] === filechecksum) {
                    return next();
                }

                oncechecksums[filename] = filechecksum;
            }

            if (settings.file) {
                fs.writeFile(settings.file, JSON.stringify(oncechecksums, null, settings.fileIndent), error => {
                    if (error) {
                        return next(new PluginError('gulp-once', error, {showStack: true}));
                    }
                });
            }

            return next(null, file);
        }
    };

    return stream;
};
