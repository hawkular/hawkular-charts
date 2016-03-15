/// <reference path='../../../typings/tsd.d.ts' />
namespace Charts {
  'use strict';

  export class HistogramChart extends AbstractHistogramChart {

    public name = 'histogram';

    public drawChart(chartOptions: Charts.ChartOptions, stacked = false) {
      super.drawChart(chartOptions, stacked);
    }
  }

}
