/**
 * Generic AWS pagination helper.
 * Iterates through pages by following `nextToken` (or a custom token field)
 * and collects all items into a single array.
 */
export async function paginateAll<TRes, TItem>(
    sendPage: (nextToken: string | undefined) => Promise<TRes>,
    getItems: (res: TRes) => TItem[] | undefined,
    getNextToken: (res: TRes) => string | undefined,
): Promise<TItem[]> {
    const items: TItem[] = [];
    let nextToken: string | undefined;
    do {
        const res = await sendPage(nextToken);
        const page = getItems(res);
        if (page) items.push(...page);
        nextToken = getNextToken(res);
    } while (nextToken);
    return items;
}
