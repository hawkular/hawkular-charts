/// <reference path='../../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  export class RhqBarChart extends AbstractHistogramChart {

    public name = 'rhqbar';

    public drawChart(chartOptions: Charts.ChartOptions, stacked = true) {
      super.drawChart(chartOptions, stacked);
    }
  }

}
