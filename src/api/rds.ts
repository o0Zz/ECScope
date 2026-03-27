import { DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { getRdsClient } from "./clients";
import type { RdsInstance } from "./types";
import { log } from "@/lib/logger";

export async function listRdsInstances(vpcId: string): Promise<RdsInstance[]> {
    log.ec2.debug(`Listing RDS instances in VPC ${vpcId}`);
    const instances: RdsInstance[] = [];
    let marker: string | undefined;

    do {
        const res = await getRdsClient().send(
            new DescribeDBInstancesCommand({ Marker: marker }),
        );

        for (const db of res.DBInstances ?? []) {
            if (db.DBSubnetGroup?.VpcId !== vpcId) continue;

            instances.push({
                dbInstanceIdentifier: db.DBInstanceIdentifier ?? "",
                dbInstanceClass: db.DBInstanceClass ?? "",
                engine: db.Engine ?? "",
                engineVersion: db.EngineVersion ?? "",
                status: db.DBInstanceStatus ?? "unknown",
                endpoint: db.Endpoint?.Address ?? "",
                port: db.Endpoint?.Port ?? 0,
                masterUsername: db.MasterUsername ?? "",
                allocatedStorage: db.AllocatedStorage ?? 0,
                multiAz: db.MultiAZ ?? false,
                storageType: db.StorageType ?? "",
                vpcId: db.DBSubnetGroup?.VpcId ?? "",
                availabilityZone: db.AvailabilityZone ?? "",
                secondaryAvailabilityZone: db.SecondaryAvailabilityZone,
                createdAt: db.InstanceCreateTime?.toISOString?.() ?? "",
                storageEncrypted: db.StorageEncrypted ?? false,
                publiclyAccessible: db.PubliclyAccessible ?? false,
            });
        }

        marker = res.Marker;
    } while (marker);

    log.ec2.debug(`Found ${instances.length} RDS instances in VPC ${vpcId}`);
    return instances;
}
