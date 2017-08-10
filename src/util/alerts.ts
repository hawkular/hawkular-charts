import { TimeInMillis, INumericDataPoint, AlertThreshold } from '../model/types'
import { ChartOptions } from '../model/chart-options'

declare const d3: any;

/**
 * Defines an individual alert bounds  to be visually highlighted in a chart
 * that an alert was above/below a threshold.
 */
export class AlertBound {
  public startDate: Date;
  public endDate: Date;

  constructor(public startTimestamp: TimeInMillis,
    public endTimestamp: TimeInMillis,
    public alertValue: number) {
    this.startDate = new Date(startTimestamp);
    this.endDate = new Date(endTimestamp);
  }
}

function createAlertLineDef(timeScale: any, yScale: any, alertValue: number) {
  return d3.svg.line()
    .interpolate('monotone')
    .x((d: INumericDataPoint) => timeScale(d.timestampSupplier()))
    .y((d: INumericDataPoint) => yScale(alertValue));
}

export function createAlertLine(chartOptions: ChartOptions,
  alertValue: number,
  cssClassName: string): void {
  const pathAlertLine = chartOptions.svg.selectAll('path.alertLine').data([chartOptions.data]);
  // update existing
  pathAlertLine.attr('class', cssClassName)
    .attr('d', createAlertLineDef(chartOptions.axis.timeScale, chartOptions.axis.yScale, alertValue));

  // add new ones
  pathAlertLine.enter().append('path')
    .attr('class', cssClassName)
    .attr('d', createAlertLineDef(chartOptions.axis.timeScale, chartOptions.axis.yScale, alertValue));

  // remove old ones
  pathAlertLine.exit().remove();
}

function extractAlertRanges(chartData: INumericDataPoint[], threshold: AlertThreshold): AlertBound[] {
  const alertBoundAreaItems: AlertBound[] = [];
  let prevInAlert = false;
  let inAlert = false;
  let startTime: TimeInMillis | null = null;
  let lastItem: INumericDataPoint | null = null;

  const interpolateTime = (current: INumericDataPoint, previous: INumericDataPoint | null) => {
    // Interpolate time between prev & current timestamps
    if (previous) {
      return (current.timestampSupplier() + previous.timestampSupplier()) / 2;
    } else {
      return current.timestampSupplier();
    }
  }

  chartData.forEach((chartItem: INumericDataPoint) => {
    const value = chartItem.valueSupplier();
    inAlert = value === undefined ? prevInAlert : value > threshold;
    if (inAlert && !prevInAlert) {
      startTime = interpolateTime(chartItem, lastItem);
    } else if (!inAlert && prevInAlert) {
      alertBoundAreaItems.push(new AlertBound(startTime!, interpolateTime(chartItem, lastItem), threshold));
    }
    lastItem = chartItem;
    prevInAlert = inAlert;
  });
  if (inAlert) {
    alertBoundAreaItems.push(new AlertBound(startTime!, interpolateTime(lastItem!, null), threshold));
  }
  return alertBoundAreaItems;
}

export function createAlertBoundsArea(chartOptions: ChartOptions, alertValue: number, highBound: number) {
  if (!chartOptions.data) {
    return;
  }
  const alertBounds: AlertBound[] = extractAlertRanges(chartOptions.data, alertValue);
  const rectAlert = chartOptions.svg.select('g.alertHolder').selectAll('rect.alertBounds').data(alertBounds);

  function alertBoundingRect(selection: any) {
    selection
      .attr('class', 'alertBounds')
      .attr('x', (d: AlertBound) => chartOptions.axis.timeScale(d.startTimestamp))
      .attr('y', () => chartOptions.axis.yScale(highBound))
      .attr('height', (d: AlertBound) => chartOptions.layout.modifiedInnerChartHeight)
      .attr('width', (d: AlertBound) => chartOptions.axis.timeScale(d.endTimestamp) - chartOptions.axis.timeScale(d.startTimestamp));
  }

  // update existing
  rectAlert.call(alertBoundingRect);

  // add new ones
  rectAlert.enter()
    .append('rect')
    .call(alertBoundingRect);

  // remove old ones
  rectAlert.exit().remove();
}
