let fs = require('fs'),
    path = require('path'),
    gulp = require('gulp'),
    once = require('.');

gulp.task('default', () => {
    fs.unlinkSync(path.resolve('.checksums'));

    return gulp.src('test/src/**/*')
        .pipe(once())
        .pipe(gulp.dest('test/dest'));
})
