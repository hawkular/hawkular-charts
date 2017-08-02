import { TransformedAvailDataPoint } from '../model/types';

declare const d3: any;

export function initTip(svg: any) {
  function buildAvailHover(d: TransformedAvailDataPoint) {
    return `<div class='chartHover'>
      <div class='info-item'>
        <span class='chartHoverLabel'>Status:</span>
        <span class='chartHoverValue'>${d.value.toUpperCase()}</span>
      </div>
      <div class='info-item before-separator'>
        <span class='chartHoverLabel'>Duration:</span>
        <span class='chartHoverValue'>${d.duration}</span>
      </div>
    </div>`;
  }

  const tip = d3.tip()
    .attr('class', 'd3-tip')
    .offset([-10, 0])
    .html((d: TransformedAvailDataPoint) => buildAvailHover(d));

  svg.call(tip);
  return tip;
}
