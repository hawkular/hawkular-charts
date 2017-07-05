'use strict';

/// NOTE: this pattern is used because enums cant be used with strings
export class EventNames {

  public static CHART_TIMERANGE_CHANGED = new EventNames('ChartTimeRangeChanged');
  public static AVAIL_CHART_TIMERANGE_CHANGED = new EventNames('AvailChartTimeRangeChanged');
  public static TIMELINE_CHART_TIMERANGE_CHANGED = new EventNames('TimelineChartTimeRangeChanged');
  public static TIMELINE_CHART_DOUBLE_CLICK_EVENT = new EventNames('TimelineChartDoubleClickEvent');
  public static CONTEXT_CHART_TIMERANGE_CHANGED = new EventNames('ContextChartTimeRangeChanged');
  public static DATE_RANGE_DRAG_CHANGED = new EventNames('DateRangeDragChanged');
  constructor(public value: string) {
    // empty
  }

  public toString(): string {
    return this.value;
  }
}
