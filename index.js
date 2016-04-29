var fs = require('fs'),
    path = require('path'),
    crypto = require('crypto'),
    Stream = require('stream'),
    oncechecksums = {};

module.exports = function(options) {

    var stream = new Stream.Transform({objectMode: true}),
        settings = Object.assign({
            namespace: false,
            algorithm: 'sha1',
            file: '.checksums',
            fileIndent: 4
        }, (typeof options === 'string') ? {namespace: options} : options);

    if (settings.file) {

        try {
            var content = fs.readFileSync(settings.file, 'utf8');
            if (content) {
                oncechecksums = JSON.parse(content);
            }
        } catch (e) {
            // go on about our business
        }
    }

    if (!!settings.namespace && !oncechecksums[settings.namespace]) {
        oncechecksums[settings.namespace] = {};
    }

    stream._transform = function(file, encoding, next) {
        var flow = this;

        if (!file.checksum) {

            if (file.isStream()) {
                flow.push(file);
                return next();
            }

            if (file.isBuffer()) {

                var filename = path.basename(file.path),
                    filechecksum = crypto
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
                    fs.writeFile(settings.file, JSON.stringify(oncechecksums, null, settings.fileIndent), function(error) {
                        if (error) {
                            flow.emit('error', error).bind(flow);
                        }
                    });
                }
            }
        }

        flow.push(file);
        return next();
    };

    return stream;
};
