import { IAnnotation } from '../model/types'
import { ChartOptions } from '../model/chart-options'

declare const d3: any;

export function annotateChart(annotationData: IAnnotation[], chartOptions: ChartOptions) {
  d3.scale.linear()
    .clamp(true)
    .rangeRound([chartOptions.layout.modifiedInnerChartHeight, 0])
    .domain(chartOptions.axis.chartRange.asD3Range());

  chartOptions.svg.selectAll('.annotationDot')
    .data(annotationData)
    .enter().append('circle')
    .attr('class', 'annotationDot')
    .attr('r', 5)
    .attr('cx', (d: IAnnotation) => chartOptions.axis.timeScale(d.timestamp))
    .attr('cy', () => chartOptions.layout.height - chartOptions.axis.yScale(chartOptions.axis.chartRange.high))
    .style('fill', (d: IAnnotation) => {
      if (d.severity === '1') {
        return 'red';
      } else if (d.severity === '2') {
        return 'yellow';
      } else {
        return 'white';
      }
    });
}
