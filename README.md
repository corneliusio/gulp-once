# gulp-once

[![NPM Version](https://img.shields.io/npm/v/gulp-once.svg?style=flat-square)](http://npmjs.com/package/gulp-once) [![Build Status](https://img.shields.io/github/actions/workflow/status/corneliusio/gulp-once/test.yml?style=flat-square)](https://github.com/corneliusio/gulp-once/actions/workflows/test.yml)

Only pass through files once unless changed

Similar to plugins such as [gulp-cache](https://www.npmjs.com/package/gulp-cache), [gulp-changed](https://www.npmjs.com/package/gulp-changed), and [gulp-newer](https://www.npmjs.com/package/gulp-newer), except it doesn't care about your dest/build files and it will still persist your "cache" (unless you don't want it to) across Gulp runs. Also makes it easy to manage what files are filtered since data is stored in an easily readable JSON file.

## Requirements

- Node.js 22.12 or newer
- Works from both ESM and CommonJS gulpfiles

## Install

```
$ npm install gulp-once --save-dev
```

## Usage

```js
import gulp from 'gulp'
import once from 'gulp-once'
import someExpensiveOperation from 'some-expensive-operation'

export default () =>
    gulp.src('src/**/*').pipe(once()).pipe(someExpensiveOperation()).pipe(gulp.dest('dest'))
```

CommonJS gulpfiles work too:

```js
const once = require('gulp-once')
```

## Options

```js
gulp.src('src/**/*')
    .pipe(
        once({
            context: process.cwd(),
            namespace: false,
            algorithm: 'sha256',
            file: '.checksums',
            fileIndent: 4,
        }),
    )
    .pipe(someExpensiveOperation())
    .pipe(gulp.dest('dest'))
```

#### `options.context`

_[string|boolean]_: Sets the path used for calculating all files' relative path, which is then used as the hash key in your checksums file. Keys always use forward slashes, so checksum files are portable across operating systems. If you only wish to store filenames without their path, you can set this option to `false`. Default: `process.cwd()`

#### `options.namespace`

_[string|function|boolean]_: If you want to separate pools/namespaces of hashes for different tasks within the same checksums file, you can assign a namespace for a specific stream. You can also provide a function that dynamically sets the namespace per file — this function is called for every file and receives a copy of the vinyl file object being checked. Default: `false`

If you do not pass an object as an option to `once()`, it will be passed to this setting.

```js
gulp.src('src/img/*')
    .pipe(once('images'))
    .pipe(someExpensiveOperation())
    .pipe(gulp.dest('dest/img'))
```

#### `options.algorithm`

_[string]_: Whatever you would want passed to [`crypto.hash()`](https://nodejs.org/api/crypto.html#cryptohashalgorithm-data-outputencoding). File contents are hashed as raw bytes, so binary files are handled correctly. Default: `'sha256'`

#### `options.file`

_[string|boolean]_: Path to file to persist data as JSON between Gulp runs. Is useful for retaining file details if Gulp exits unexpectedly and you have to restart, if you run tasks manually (i.e. you don't `gulp.watch()` files), or to just not run unnecessary actions between work sessions. Also allows you to easily "cache bust" specific files if you are so inclined. Can be set to `false` to store data in memory; this effectively turns off persistence as a file will not be created/updated with any file changes. Default: `'.checksums'`

The file is written atomically (temp file + rename), and a malformed or unreadable checksum file is ignored with a warning rather than crashing the build.

Note: a file's checksum is recorded when it _passes through_ this plugin, not when the rest of your pipeline finishes. If a later step fails, delete the file's entry from the checksum file (or the whole file) to force it through again.

#### `options.fileIndent`

_[int]_: If you're a stickler for spacing on your files, you can set the indentation for the checksum file. Has no effect if `options.file` is set to `false`. Default: `4`

## Migrating from v2

- **Node 22.12+ is required.** The package is now ESM with TypeScript types included; `require('gulp-once')` continues to work on supported Node versions.
- **The default hash algorithm changed from `sha1` to `sha256`**, so every file will pass through once more after upgrading while the checksum file regenerates. Set `algorithm: 'sha1'` to keep existing checksum files valid.
- **Errors are now instances of the exported `GulpOnceError`** (with a `plugin: 'gulp-once'` property) instead of `plugin-error`. The plugin has no runtime dependencies.
- Dynamic namespace functions are now called for every file (previously only the first file in a stream, which was a bug).
