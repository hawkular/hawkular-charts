/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    class EventNames {
        value: string;
        static CHART_TIMERANGE_CHANGED: EventNames;
        static AVAIL_CHART_TIMERANGE_CHANGED: EventNames;
        static TIMELINE_CHART_TIMERANGE_CHANGED: EventNames;
        static TIMELINE_CHART_DOUBLE_CLICK_EVENT: EventNames;
        static CONTEXT_CHART_TIMERANGE_CHANGED: EventNames;
        static DATE_RANGE_DRAG_CHANGED: EventNames;
        constructor(value: string);
        toString(): string;
    }
}
