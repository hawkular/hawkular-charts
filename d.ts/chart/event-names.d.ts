declare namespace Charts {
    class EventNames {
        value: string;
        static CHART_TIMERANGE_CHANGED: EventNames;
        static AVAIL_CHART_TIMERANGE_CHANGED: EventNames;
        static CONTEXT_CHART_TIMERANGE_CHANGED: EventNames;
        constructor(value: string);
        toString(): string;
    }
}
