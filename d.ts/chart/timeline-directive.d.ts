/// <reference path="../../typings/tsd.d.ts" />
declare namespace Charts {
    class EmsEvent {
        timestamp: TimeInMillis;
        eventSource: string;
        provider: string;
        html: string;
        message: string;
        resource: string;
        constructor(timestamp: TimeInMillis, eventSource: string, provider: string, html?: string, message?: string, resource?: string);
    }
    /**
     * TimelineEvent is a subclass of EmsEvent that is specialized toward screen display
     */
    class TimelineEvent extends EmsEvent {
        timestamp: TimeInMillis;
        eventSource: string;
        provider: string;
        html: string;
        message: string;
        resource: string;
        formattedDate: string;
        color: string;
        row: number;
        selected: boolean;
        constructor(timestamp: TimeInMillis, eventSource: string, provider: string, html?: string, message?: string, resource?: string, formattedDate?: string, color?: string, row?: number, selected?: boolean);
        /**
         * Build TimelineEvents from EmsEvents
         * @param emsEvents
         */
        static buildEvents(emsEvents: EmsEvent[]): TimelineEvent[];
        /**
         * BuildFakeEvents is a fake event builder for testing/prototyping
         * @param n the number of events you want generated
         * @param startTimeStamp
         * @param endTimestamp
         * @returns {TimelineEvent[]}
         */
        static buildFakeEvents(n: number, startTimeStamp: TimeInMillis, endTimestamp: TimeInMillis): TimelineEvent[];
    }
    /**
     * Random number generator
     */
    class Random {
        static randomBetween(min: number, max: number): number;
    }
    class TimelineChartDirective {
        private static _CHART_HEIGHT;
        private static _CHART_WIDTH;
        restrict: string;
        replace: boolean;
        scope: {
            events: string;
            startTimestamp: string;
            endTimestamp: string;
        };
        link: (scope: any, element: ng.IAugmentedJQuery, attrs: any) => void;
        events: TimelineEvent[];
        constructor($rootScope: ng.IRootScopeService);
        static Factory(): ($rootScope: ng.IRootScopeService) => TimelineChartDirective;
    }
}
