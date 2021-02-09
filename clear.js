const fs = require('fs');
const PluginError = require('plugin-error');

let oncechecksums = {};

module.exports = (options = {}) => {
    let settings = {
            namespace: false,
            delete: false, // false = empties entry/file, true = deletes entry/file
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
            console.log('No cache file \'' + settings.file + '\', nothing to clear.');
            return;
        }

        try {
            let content = fs.readFileSync(settings.file, 'utf8');

            if (content) {
                oncechecksums = JSON.parse(content);
            }
        } catch (e) {
            // go on about our business
            console.log(e);
            return;
        }
    }

    if (!!settings.namespace) {
        if (settings.namespace in oncechecksums) {
            if (settings.delete) {
                delete oncechecksums[settings.namespace];
            } else {
                oncechecksums[settings.namespace] = {};
            }
        } else {
            console.log('No namespace \'' + settings.namespace + '\', nothing to clear.');
            return;
        }
    } else {
        if (settings.delete) {
            if (settings.file) {
                try {
                    fs.unlinkSync(settings.file);
                } catch (e) {
                    return next(new PluginError('gulp-once', e, { showStack: true }));
                }
            }
            return;
        } else {
            oncechecksums = {};
        }
    }

    if (settings.file) {
        try {
            fs.writeFileSync(settings.file, JSON.stringify(oncechecksums, null, settings.fileIndent));
        } catch (e) {
            return next(new PluginError('gulp-once', e, { showStack: true }));
        }
    }

    return;
};
