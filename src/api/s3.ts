import {
    S3Client,
    GetObjectCommand,
    DeleteObjectCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { S3Credentials } from "./types";

function makeS3Client(creds: S3Credentials): S3Client {
    return new S3Client({
        region: creds.region,
        credentials: {
            accessKeyId: creds.accessKeyId,
            secretAccessKey: creds.secretAccessKey,
            ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}),
        },
    });
}

export async function downloadFromS3(creds: S3Credentials, bucket: string, key: string): Promise<Uint8Array> {
    const client = makeS3Client(creds);
    const res = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) throw new Error("S3 GetObject returned empty body");
    return new Uint8Array(await res.Body.transformToByteArray());
}

export async function deleteFromS3(creds: S3Credentials, bucket: string, key: string): Promise<void> {
    const client = makeS3Client(creds);
    await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
    );
}

export async function uploadToS3(creds: S3Credentials, bucket: string, key: string, data: Uint8Array): Promise<void> {
    const client = makeS3Client(creds);
    await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: data }),
    );
}
