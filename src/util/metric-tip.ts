
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
                        avgLabel: string,
                        prevTimestampSupplier: (idx: number) => number | undefined) {

  function buildHover(dataPoint: INumericDataPoint, i: number) {
    const currentTimestamp = dataPoint.timestampSupplier();
    let hover,
      barDuration;

    const formattedDateTime = moment(currentTimestamp).format(HOVER_DATE_TIME_FORMAT);
    const prevTimestamp = prevTimestampSupplier(i);
    if (prevTimestamp !== undefined) {
      barDuration = moment(currentTimestamp).from(moment(prevTimestamp), true);
    }

    if (dataPoint.isEmpty()) {
      // nodata
      hover = `<div class='chartHover'>
        <small class='chartHoverLabel'>${noDataLabel}</small>
        <div><small><span class='chartHoverLabel'>${durationLabel}</span><span>:
        </span><span class='chartHoverValue'>${barDuration}</span></small> </div>
        <hr/>
        <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>:
        </span><span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        </div>`;
    } else {
      if (dataPoint.isRaw()) {
        // raw single value from raw table
        hover = `<div class='chartHover'>
        <div><small><span class='chartHoverLabel'>${timestampLabel}</span><span>: </span>
        <span class='chartHoverValue'>${formattedDateTime}</span></small></div>
        <hr/>
        <div><small><span class='chartHoverLabel'>${singleValueLabel}</span><span>: </span>
        <span class='chartHoverValue'>${d3.round(dataPoint.valueSupplier(), 2)}</span></small> </div>
        </div> `;
      } else {
        // aggregate with min/avg/max
        const bucketDP: NumericBucketPoint = <NumericBucketPoint>dataPoint;
        hover = `<div class='chartHover'>
            <div class='info-item'>
              <span class='chartHoverLabel'>${timestampLabel}:</span>
              <span class='chartHoverValue'>${formattedDateTime}</span>
            </div>
            <div class='info-item before-separator'>
              <span class='chartHoverLabel'>${durationLabel}:</span>
              <span class='chartHoverValue'>${barDuration}</span>
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
    return hover;
  }

  const tip = d3.tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html((d: INumericDataPoint, i: number) => buildHover(d, i));

  svg.call(tip);
  return tip;
}
