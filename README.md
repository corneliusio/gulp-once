# gulp-once

[![NPM Version](https://img.shields.io/npm/v/gulp-once.svg?style=flat-square)](http://npmjs.com/package/gulp-once) [![Build Status](https://img.shields.io/travis/corneliusio/gulp-once/master.svg?style=flat-square)](https://travis-ci.org/corneliusio/gulp-once)

Only pass through files once unless changed

Similar to plugins such as [gulp-cache](https://www.npmjs.com/package/gulp-cache), [gulp-changed](https://www.npmjs.com/package/gulp-changed), and [gulp-newer](https://www.npmjs.com/package/gulp-newer), except it doesn't care about your dest/build files and it will still persist your "cache" (unless you don't want it to) across Gulp runs. Also makes it easy to manage what files are filtered since data is stored in a easily readable JSON file.

## Install

```
$ npm install gulp-once --save-dev
```


## Usage

```js
var gulp = require('gulp'),
    once = require('gulp-once'),
    someExpensiveOperation = require('some-expensive-operation');

gulp.task('default', function() {

    gulp.src('src/**/*')
        .pipe(once()),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest'));
});
```


## Options

```js
    gulp.src('src/**/*')
        .pipe(once({
            context: process.cwd(),
            namespace: false,
            algorithm: 'sha1',
            file: '.checksums',
            fileIndent: 4
        })),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest'));
```

#### `options.context`
*[string|boolean]*: Sets the path used for calculating all files' relative path, which is then used as the hash key in your checksums file. If you only wish to store filenames without their path, you can set this option to `false`. Default: `process.cwd()`

```js
    gulp.src('src/img/*')
        .pipe(once('images')),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest/img'));
```

#### `options.namespace`
*[string|function|boolean]*: If you want to separate pools/namespaces of hashes for different tasks within the same checksums 
file, you can assign a namespace for a specific stream. You can also provide a function that dynamically sets the namespace per file—this function will be passed a copy of the file vinyl file object being checked. Default: `false`

If you do not pass an object as an option to `once()`, it will be passed to this setting.

```js
    gulp.src('src/img/*')
        .pipe(once('images')),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest/img'));
```

#### `options.algorithm`
*[string]*: Whatever you would want passed to [`crypto.createHash()`](https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm) Default: `'sha1'`

#### `options.file`
*[string|boolean]*: Path to file to persist data as JSON between Gulp runs. Is useful for retaining file details if Gulp exits unexpectedly and you have to restart, if you run tasks manually (i.e. You don't `gulp.watch()` files), or to just not run unnecessary actions between work sessions. Also allows you to easily "cache bust" for specific files easily if you are so inclined. Can be set to `false` to store data in memory, this effectively turns off persistance as a file will not be created/updated with any file changes. Default: `'.checksums'`

```js
    gulp.src('src/img/*')
        .pipe(once({file: 'path/to/file.json'})),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest/img'));
```

#### `options.fileIndent`
*[int]*: If you're a stickler for spacing on your files, you can set the indentation for the checksumed files. Has no effect if `options.file`
is set to `false`. Default: `4`
