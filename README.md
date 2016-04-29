# gulp-once
Only pass through files once unless changed

Similar to plugins such as [gulp-cache](https://www.npmjs.com/package/gulp-cache), [gulp-changed](https://www.npmjs.com/package/gulp-changed), and [gulp-newer](https://www.npmjs.com/package/gulp-newer), except it doesn't care about your dest/build files (incase you don't source control your compiled/built files) and it will still persist your "cache" (unless you don't want it to) across Gulp runs. Also makes it easy to manage what files are filtered since data is stored in a easily readable JSON file.

## Install

```
$ npm install --save-dev gulp-once
```


## Usage

```js
var gulp = require('gulp'),
    once = require('gulp-once'),
    someExpensiveOperation = require('some-expensive-operation'); // just for example.

gulp.task('default', function() {

    gulp.src('src/*')
        .pipe(once()),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest'));
});
```


## Options

```js
    gulp.src('src/*')
        .pipe(once({
            namespace: false,
            algorithm: 'sha1',
            file: '.checksums',
            fileIndent: 4
        })),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest'));
```

`options.namespace` *[string|boolean]*: If you want to seperate pools/namespaces of caches for different tasks (For instance, two unrelated files have are in two seperate locations but have the same name), you can assign a namespace for a specific stream. Default: `false`

If you pass a string as an option to `once()`, it will be passed to this setting.

```js
    gulp.src('src/img/*')
        .pipe(once('images')),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest/img'));
```

`options.algorithm` *[string]*: Whatever you would want passed to [`crypto.createHash()`](https://nodejs.org/api/crypto.html#crypto_crypto_createhash_algorithm) Default: `'sha1'`

`options.file` *[string|boolean]*: Path to file to persist data as JSON between Gulp runs. Is useful for retaining file details if Gulp exits unexpectedly and you have to restart, if you fun tasks manually (i.e. You don't `gulp.watch()` files), or to just not run unnecessary actions between work sessions. Also allows you to easily "cache bust" for specific files easily if you are so inclined. Can be set to `false` to store data in memory, this effectively turns off persistance as a file will not be created/updated with any file changes. Default: `'.checksums'`

```js
    gulp.src('src/img/*')
        .pipe(once({file: 'path/to/file.json'})),
        .pipe(someExpensiveOperation())
        .pipe(gulp.dest('dest/img'));
```

`options.fileIndent` *[int]*: If you're a stickler for spacing on your files, you can set the indentation for the checksumed files. Has no effect if `options.file` is set to `false`. Default: `4`
