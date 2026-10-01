import {
    AuthorizeSecurityGroupIngressCommand,
    DescribeManagedPrefixListsCommand,
    DescribeSecurityGroupRulesCommand,
    GetManagedPrefixListEntriesCommand,
    ModifyManagedPrefixListCommand,
    RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";
import { getEc2Client } from "./clients";
import type { PrefixList, SecurityGroupRule } from "./types";
import { log } from "@/lib/logger";

/**
 * List inbound rules of the given security groups.
 */
export async function listIngressRules(groupIds: string[]): Promise<SecurityGroupRule[]> {
    if (groupIds.length === 0) return [];
    log.ec2.debug(`Listing ingress rules for ${groupIds.join(", ")}`);

    const rules: SecurityGroupRule[] = [];
    let nextToken: string | undefined;

    do {
        const res = await getEc2Client().send(
            new DescribeSecurityGroupRulesCommand({
                Filters: [{ Name: "group-id", Values: groupIds }],
                NextToken: nextToken,
            }),
        );

        for (const r of res.SecurityGroupRules ?? []) {
            if (r.IsEgress) continue;
            rules.push({
                ruleId: r.SecurityGroupRuleId ?? "",
                groupId: r.GroupId ?? "",
                protocol: r.IpProtocol ?? "",
                fromPort: r.FromPort ?? -1,
                toPort: r.ToPort ?? -1,
                source: r.CidrIpv4 ?? r.CidrIpv6 ?? r.ReferencedGroupInfo?.GroupId ?? r.PrefixListId ?? "",
                description: r.Description ?? "",
            });
        }

        nextToken = res.NextToken;
    } while (nextToken);

    return rules;
}

/** Bare IPs become a single-host CIDR (/32 or /128). */
function toCidr(ip: string): string {
    return ip.includes("/") ? ip : `${ip}/${ip.includes(":") ? 128 : 32}`;
}

/**
 * Allow inbound TCP traffic on `port` from `cidr` (bare IPs get /32 or /128).
 */
export async function addIngressRule(groupId: string, ip: string, port: number, description: string): Promise<void> {
    const isV6 = ip.includes(":");
    const cidr = toCidr(ip);
    log.ec2.info(`Authorizing ${cidr}:${port} on ${groupId}`);

    const range = { Description: description || undefined };
    await getEc2Client().send(
        new AuthorizeSecurityGroupIngressCommand({
            GroupId: groupId,
            IpPermissions: [
                {
                    IpProtocol: "tcp",
                    FromPort: port,
                    ToPort: port,
                    ...(isV6
                        ? { Ipv6Ranges: [{ ...range, CidrIpv6: cidr }] }
                        : { IpRanges: [{ ...range, CidrIp: cidr }] }),
                },
            ],
        }),
    );
}

export async function removeIngressRule(groupId: string, ruleId: string): Promise<void> {
    log.ec2.info(`Revoking rule ${ruleId} on ${groupId}`);
    await getEc2Client().send(
        new RevokeSecurityGroupIngressCommand({ GroupId: groupId, SecurityGroupRuleIds: [ruleId] }),
    );
}

/**
 * Describe a managed prefix list with its CIDR entries.
 */
export async function getPrefixList(prefixListId: string): Promise<PrefixList> {
    const [desc, entries] = await Promise.all([
        getEc2Client().send(new DescribeManagedPrefixListsCommand({ PrefixListIds: [prefixListId] })),
        getEc2Client().send(new GetManagedPrefixListEntriesCommand({ PrefixListId: prefixListId, MaxResults: 100 })),
    ]);
    const pl = desc.PrefixLists?.[0];
    return {
        prefixListId,
        name: pl?.PrefixListName ?? "",
        version: pl?.Version ?? 0,
        maxEntries: pl?.MaxEntries ?? 0,
        state: pl?.State ?? "",
        awsManaged: pl?.OwnerId === "AWS",
        entries: (entries.Entries ?? []).map((e) => ({ cidr: e.Cidr ?? "", description: e.Description ?? "" })),
    };
}

/**
 * Add or remove one CIDR entry. `version` must be the list's current version (optimistic locking).
 */
export async function modifyPrefixList(
    prefixListId: string,
    version: number,
    change: { add?: { ip: string; description: string }; removeCidr?: string },
): Promise<void> {
    log.ec2.info(`Modifying prefix list ${prefixListId} (v${version})`);
    await getEc2Client().send(
        new ModifyManagedPrefixListCommand({
            PrefixListId: prefixListId,
            CurrentVersion: version,
            AddEntries: change.add
                ? [{ Cidr: toCidr(change.add.ip), Description: change.add.description || undefined }]
                : undefined,
            RemoveEntries: change.removeCidr ? [{ Cidr: change.removeCidr }] : undefined,
        }),
    );
}
