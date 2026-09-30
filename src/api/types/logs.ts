export interface LogLine {
    id: string;
    timestamp: number;
    message: string;
    /** Log stream name (only set for multi-stream queries) */
    stream?: string;
}

export interface LogStreamPage {
    events: LogLine[];
    nextForwardToken?: string;
    nextBackwardToken?: string;
}
