/*
 * Copyright 2014-2015 Red Hat, Inc. and/or its affiliates
 * and other contributors as indicated by the @author tags.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var gulp = require('gulp'),
  wiredep = require('wiredep').stream,
  eventStream = require('event-stream'),
  gulpLoadPlugins = require('gulp-load-plugins'),
  map = require('vinyl-map'),
  fs = require('fs'),
  path = require('path'),
  filesize = require('gulp-filesize'),
  rename = require('gulp-rename'),
  s = require('underscore.string'),
  size = require('gulp-size'),
//stripDebug = require('gulp-strip-debug'),
  ts = require('gulp-typescript'),
  merge = require('merge2'),
  uglify = require('gulp-uglify'),
  gutil = require('gulp-util'),
  browsersync = require('browser-sync'),
  tslint = require('gulp-tslint');

var plugins = gulpLoadPlugins({});
var pkg = require('./package.json');

var config = {
  main: '.',
  ts: ['src/**/*.ts'],
  css: ['css/*.css'],
  dist: './dist/',
  js: pkg.name + '.js',
  tsProject: plugins.typescript.createProject({
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: true,
    noExternalResolve: false
  })
};

var normalSizeOptions = {
  showFiles: true
}, gZippedSizeOptions = {
  showFiles: true,
  gzip: true
};

gulp.task('bower', function () {
  gulp.src('metrics-chart-sample.html')
    .pipe(wiredep({}))
    .pipe(gulp.dest('.'));
});

/** Adjust the reference path of any typescript-built plugin this project depends on */
gulp.task('path-adjust', function () {
  gulp.src('libs/**/includes.d.ts')
    .pipe(map(function (buf, filename) {
      var textContent = buf.toString();
      var newTextContent = textContent.replace(/"\.\.\/libs/gm, '"../../../libs');
      //console.log("Filename: ", filename, " old: ", textContent, " new:", newTextContent);
      return newTextContent;
    }))
    .pipe(gulp.dest('libs'));
});

gulp.task('clean-defs', function () {
  return gulp.src('defs.d.ts', {read: false})
    .pipe(plugins.clean());
});

gulp.task('tsc', ['clean-defs'], function () {
  var cwd = process.cwd();
  var tsResult = gulp.src(config.ts)
    .pipe(plugins.typescript(config.tsProject))
    .on('error', plugins.notify.onError({
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

  return eventStream.merge(
    tsResult.js
      .pipe(plugins.concat(config.js))
      //.pipe(stripDebug())
      .pipe(gulp.dest('.'))
      .pipe(uglify())
      .pipe(rename('hawkular-charts.min.js'))
      .pipe(gulp.dest('.')),

    tsResult.dts
      .pipe(gulp.dest('d.ts')))
    .pipe(map(function (buf, filename) {
      if (!s.endsWith(filename, 'd.ts')) {
        return buf;
      }
      var relative = path.relative(cwd, filename);
      fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
      return buf;
    }));
});


gulp.task('tslint', function () {
  gulp.src(config.ts)
    .pipe(tslint())
    .pipe(tslint.report('verbose'));
});

gulp.task('browsersync', function(callback) {
  return browsersync({
    server: {
      baseDir:'./'
    }
  }, callback);
});


gulp.task('concat', function () {
  var gZipSize = size(gZippedSizeOptions);
  return gulp.src([config.js])
    .pipe(plugins.concat(config.js))
    .pipe(size(normalSizeOptions))
    .pipe(gZipSize);
});

gulp.task('clean', ['concat'], function () {
  return gulp.src([config.js], {read: false})
    .pipe(plugins.clean());
});

gulp.task('dev-build', ['bower', 'path-adjust', 'tslint', 'tsc', 'concat', 'clean']);

gulp.task('watch', function () {
  gulp.watch(config.css, ['dev-build', browsersync.reload]);
  gulp.watch(config.js, ['dev-build', browsersync.reload]);
});


gulp.task('build', ['bower', 'path-adjust', 'tslint', 'tsc', 'concat', 'clean']);
//gulp.task('default', gulp.parallel('bower', 'path-adjust','tslint','tsc','concat', 'browsersync', 'watch'));
gulp.task('default', ['watch']);



