import { ChartOptions } from './chart-options'
import { IChartType } from './chart-type'
import { INumericDataPoint } from './types'
import { hashString } from '../util/utility'

declare const d3: any;

export class MultiLineChart implements IChartType {

  public name = 'multiline';

  public drawChart(chart: ChartOptions) {

    const colorScale = d3.scale.category10();
    let g = 0;

    if (chart.multiData) {
      // before updating, let's remove those missing from datapoints (if any)
      chart.svg.selectAll('path[id^=\'multiLine\']')[0].forEach((existingPath: any) => {
        let stillExists = false;
        chart.multiData!.forEach((singleChartData) => {
          singleChartData.keyHash = singleChartData.keyHash
            || ('multiLine' + hashString(singleChartData.key));
          if (existingPath.getAttribute('id') === singleChartData.keyHash) {
            stillExists = true;
          }
        });
        if (!stillExists) {
          existingPath.remove();
        }
      });

      chart.multiData.forEach((singleChartData) => {
        if (singleChartData && singleChartData.values) {
          singleChartData.keyHash = singleChartData.keyHash
            || ('multiLine' + hashString(singleChartData.key));
          const pathMultiLine = chart.svg.selectAll('path#' + singleChartData.keyHash)
            .data([singleChartData.values]);
          // update existing
          pathMultiLine.attr('id', singleChartData.keyHash)
            .attr('class', 'multiLine')
            .attr('fill', 'none')
            .attr('stroke', () => {
              return singleChartData.color || colorScale(String(g++));
            })
            .transition()
            .attr('d', this.createLine('linear', chart.axis.timeScale, chart.axis.yScale));
          // add new ones
          pathMultiLine.enter().append('path')
            .attr('id', singleChartData.keyHash)
            .attr('class', 'multiLine')
            .attr('fill', 'none')
            .attr('stroke', () => {
              if (singleChartData.color) {
                return singleChartData.color;
              } else {
                return colorScale(String(g++));
              }
            })
            .transition()
            .attr('d', this.createLine('linear', chart.axis.timeScale, chart.axis.yScale));
          // remove old ones
          pathMultiLine.exit().remove();
        }
      });
    } else {
      console.warn('No multi-data set for multiline chart');
    }

  }

  private createLine(interpolate: string, timeScale: any, yScale: any) {
    return d3.svg.line()
        .interpolate(interpolate)
        .defined((d: INumericDataPoint) => !d.isEmpty())
        .x((d: INumericDataPoint) => timeScale(d.timestampSupplier()))
        .y((d: INumericDataPoint) => yScale(d.valueSupplier()));
  }

}
