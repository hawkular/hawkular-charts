/*
 * Copyright 2014-2016 Red Hat, Inc. and/or its affiliates
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

'use strict';

const gulp = require('gulp'),
  wiredep = require('wiredep').stream,
  eventStream = require('event-stream'),
  gulpLoadPlugins = require('gulp-load-plugins'),
  map = require('vinyl-map'),
  express = require('express'),
  fs = require('fs'),
  path = require('path'),
  rename = require('gulp-rename'),
  s = require('underscore.string'),
  size = require('gulp-size'),
  ts = require('gulp-typescript'),
  merge = require('merge2'),
  uglify = require('gulp-uglify'),
  gutil = require('gulp-util'),
  browsersync = require('browser-sync'),
  tslint = require('gulp-tslint');

let server;
const plugins = gulpLoadPlugins({});
const pkg = require('./package.json');

const config = {
  main: '.',
  ts: ['src/**/*.ts'],
  less: ['src/**/*.less'],
  js: pkg.name + '.js',
  tsProject: plugins.typescript.createProject({
    target: 'ES5',
    module: 'commonjs',
    declarationFiles: true,
    noExternalResolve: false
  })
};

const normalSizeOptions = {
  showFiles: true
}, gZippedSizeOptions = {
  showFiles: true,
  gzip: true
};

gulp.task('bower', function () {
  gulp.src('index.html')
    .pipe(wiredep({}))
    .pipe(gulp.dest('.'));
});

/** Adjust the reference path of any typescript-built plugin this project depends on */
gulp.task('path-adjust', function () {
  gulp.src('libs/**/includes.d.ts')
    .pipe(map(function (buf, filename) {
      const textContent = buf.toString();
      const newTextContent = textContent.replace(/"\.\.\/libs/gm, '"../../../libs');
      //console.log("Filename: ", filename, " old: ", textContent, " new:", newTextContent);
      return newTextContent;
    }))
    .pipe(gulp.dest('libs'));
});

gulp.task('clean-defs', function () {
  return gulp.src('defs.d.ts', {read: false})
    .pipe(plugins.clean());
});

gulp.task('tsc-prod', ['clean-defs'], function () {
  const cwd = process.cwd();
  let tsResult = gulp.src(config.ts)
    .pipe(plugins.typescript(config.tsProject))
    .on('error', plugins.notify.onError({
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

  return eventStream.merge(
    tsResult.js
      .pipe(plugins.concat(config.js))
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
      const relative = path.relative(cwd, filename);
      fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
      return buf;
    }));
});

gulp.task('tsc-dev', ['clean-defs'], function () {
  const cwd = process.cwd();
  let tsResult = gulp.src(config.ts)
    .pipe(plugins.typescript(config.tsProject))
    .on('error', plugins.notify.onError({
      message: '<%= error.message %>',
      title: 'Typescript compilation error'
    }));

  return eventStream.merge(
    tsResult.js
      .pipe(plugins.concat(config.js))
      .pipe(gulp.dest('.'))
      .pipe(reload()),

    tsResult.dts
      .pipe(gulp.dest('d.ts')))
    .pipe(map(function (buf, filename) {
      if (!s.endsWith(filename, 'd.ts')) {
        return buf;
      }
      const relative = path.relative(cwd, filename);
      fs.appendFileSync('defs.d.ts', '/// <reference path="' + relative + '"/>\n');
      return buf;
    }));
});



gulp.task('tslint', function () {
  gulp.src(config.ts)
    .pipe(tslint())
    .pipe(tslint.report('verbose'));
});



gulp.task('less', function(){
  gulp.src(config.less)
    .pipe(plugins.less())
    .pipe(plugins.concat('css/hawkular-charts.css'))
    .pipe(gulp.dest('.'))
    .pipe(reload());
});



gulp.task('concat', function () {
  const gZipSize = size(gZippedSizeOptions);
  return gulp.src([config.js])
    .pipe(plugins.concat(config.js))
    .pipe(size(normalSizeOptions))
    .pipe(gZipSize);
});

gulp.task('clean', function () {
  return gulp.src([config.js], {read: false})
    .pipe(plugins.clean());
});

gulp.task('server', ['build', 'watch'], function () {
  server = express();
  server.use(express.static('.'));
  server.listen(8000);
  browsersync({proxy: 'localhost:8000'})
});

gulp.task('dev-build', ['bower', 'path-adjust', 'less', 'tslint', 'tsc-dev', 'concat', 'clean']);

gulp.task('watch', function () {
  gulp.watch(config.less, ['less']);
  gulp.watch(config.ts, ['tsc-dev']);
});


gulp.task('build', ['bower', 'path-adjust', 'less', 'tslint', 'tsc-prod', 'concat', 'clean']);
gulp.task('default', ['server']);


function reload() {
  if(server) {
    return browsersync.reload({stream:true});
  }
  return gutil.noop();
}

