import resolve from 'rollup-plugin-node-resolve';

// Add here external dependencies that actually you use.
const globals = {
  '@angular/core': 'ng.core',
  '@angular/common': 'ng.common',
  'rxjs/Observable': 'Rx',
  'rxjs/Subscription': 'Rx',
  'rxjs/observable/IntervalObservable': 'Rx',
  'rxjs/Observer': 'Rx',
  'rxjs/add/operator/map': 'Rx'
};

export default {
  entry: './dist/modules/hawkular-charts.es5.js',
  dest: './dist/bundles/hawkular-charts.umd.js',
  format: 'umd',
  exports: 'named',
  moduleName: 'ng.hawkularCharts',
  plugins: [resolve()],
  external: Object.keys(globals),
  globals: globals,
  onwarn: () => { return }
}
