
import { INumericDataPoint, NumericBucketPoint } from '../model/types';

declare const d3: any;
declare const moment: any;

const HOVER_DATE_TIME_FORMAT = 'MM/DD/YYYY h:mm:ss a';

export function initTip(svg: any,
                        noDataLabel: string,
                        durationLabel: string,
                        timestampLabel: string,
                        singleValueLabel: string,
                        minLabel: string,
                        maxLabel: string,
                        avgLabel: string) {

  function buildHover(dataPoint: INumericDataPoint, i: number) {
    const currentTimestamp = dataPoint.timestampSupplier();
    const formattedDateTime = moment(currentTimestamp).format(HOVER_DATE_TIME_FORMAT);

    if (dataPoint.isRaw()) {
      // raw single value from raw table
      return `<div class='chartHover'>
        <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>: </span>
        <span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        <hr/>
        <div><small><span class='chartHoverLabel'>${singleValueLabel}</span><span>: </span>
        <span class='chartHoverValue'>${d3.round(dataPoint.valueSupplier(), 2)}</span></small> </div>
      </div> `;
    } else {
      // aggregate with min/avg/max
      const bucketDP: NumericBucketPoint = <NumericBucketPoint>dataPoint;
      const duration = moment(bucketDP.end).from(moment(bucketDP.start), true);
      if (bucketDP.empty) {
        // nodata
        return `<div class='chartHover'>
          <small class='chartHoverLabel'>${noDataLabel}</small>
          <div><small><span class='chartHoverLabel'>${durationLabel}</span><span>:
          </span><span class='chartHoverValue'>${duration}</span></small> </div>
          <hr/>
          <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>:
          </span><span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        </div>`;
      } else {
        return `<div class='chartHover'>
          <div class='info-item'>
            <span class='chartHoverLabel'>${timestampLabel}:</span>
            <span class='chartHoverValue'>${formattedDateTime}</span>
          </div>
          <div class='info-item before-separator'>
            <span class='chartHoverLabel'>${durationLabel}:</span>
            <span class='chartHoverValue'>${duration}</span>
          </div>
          <div class='info-item separator'>
            <span class='chartHoverLabel'>${maxLabel}:</span>
            <span class='chartHoverValue'>${d3.round(bucketDP.max, 2)}</span>
          </div>
          <div class='info-item'>
            <span class='chartHoverLabel'>${avgLabel}:</span>
            <span class='chartHoverValue'>${d3.round(bucketDP.avg, 2)}</span>
          </div>
          <div class='info-item'>
            <span class='chartHoverLabel'>${minLabel}:</span>
            <span class='chartHoverValue'>${d3.round(bucketDP.min, 2)}</span>
          </div>
        </div> `;
      }
    }
  }

  const tip = d3.tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html((d: INumericDataPoint, i: number) => buildHover(d, i));

  svg.call(tip);
  return tip;
}
