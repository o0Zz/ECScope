import { GetLogEventsCommand, FilterLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { getLogsClient } from "./clients";
import type { LogLine, LogStreamPage } from "./types";
import { log } from "@/lib/logger";

/** Hard cap on events fetched by one filterLogEvents call (keeps huge log groups responsive) */
const MAX_FILTER_EVENTS = 10_000;

/**
 * Read one log stream. Without a token, returns the most recent `limit` events.
 * With `nextForwardToken` → newer events (tailing); with `nextBackwardToken` → older events.
 */
export async function getLogStreamEvents(
    logGroupName: string,
    logStreamName: string,
    nextToken?: string,
    limit = 500,
): Promise<LogStreamPage> {
    const res = await getLogsClient().send(
        new GetLogEventsCommand({
            logGroupName,
            logStreamName,
            nextToken,
            limit,
            // Only meaningful without a token: start from the tail
            startFromHead: false,
        }),
    );
    return {
        events: (res.events ?? []).map((e, i) => ({
            // GetLogEvents has no event id; timestamp+ingestion+index is unique within a page
            id: `${e.timestamp}-${e.ingestionTime}-${i}-${e.message?.length ?? 0}`,
            timestamp: e.timestamp ?? 0,
            message: e.message ?? "",
        })),
        nextForwardToken: res.nextForwardToken,
        nextBackwardToken: res.nextBackwardToken,
    };
}

/**
 * Events across every stream matching a prefix (e.g. all tasks of a service container), oldest first.
 * Returns `truncated: true` when MAX_FILTER_EVENTS was hit.
 */
export async function filterLogEvents(
    logGroupName: string,
    logStreamNamePrefix: string,
    startTime: number,
): Promise<{ events: LogLine[]; truncated: boolean }> {
    log.cloudwatch.debug(
        `Filtering ${logGroupName} (${logStreamNamePrefix}*) since ${new Date(startTime).toISOString()}`,
    );
    const events: LogLine[] = [];
    let nextToken: string | undefined;
    do {
        const res = await getLogsClient().send(
            new FilterLogEventsCommand({ logGroupName, logStreamNamePrefix, startTime, nextToken, limit: 1000 }),
        );
        for (const e of res.events ?? []) {
            events.push({
                id: e.eventId ?? `${e.timestamp}-${e.logStreamName}`,
                timestamp: e.timestamp ?? 0,
                message: e.message ?? "",
                stream: e.logStreamName,
            });
        }
        nextToken = res.nextToken;
    } while (nextToken && events.length < MAX_FILTER_EVENTS);
    return { events, truncated: !!nextToken };
}
