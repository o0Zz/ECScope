import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import { sendSsmCommand } from "../ssm";
import { downloadFromS3, deleteFromS3, uploadToS3 } from "../s3";
import type { S3Credentials } from "../types";

/** Download a file from S3, prompt user to save locally, then clean up S3. */
export async function downloadFile(
    creds: S3Credentials,
    bucket: string,
    s3Key: string,
    opts?: { title?: string; cleanupS3?: boolean },
): Promise<void> {
    const filename = s3Key.split("/").pop() ?? "download";
    const ext = filename.includes(".") ? filename.split(".").pop()! : "*";

    const savePath = await save({
        defaultPath: filename,
        filters: [{ name: "File", extensions: [ext] }],
        title: opts?.title ?? "Save File",
    });

    if (!savePath) return;

    console.log(`[download] Downloading s3://${bucket}/${s3Key} ...`);
    const data = await downloadFromS3(creds, bucket, s3Key);

    await writeFile(savePath, data);
    console.log(`[download] Saved ${data.length} bytes to ${savePath}`);

    if (opts?.cleanupS3 !== false) {
        await deleteFromS3(creds, bucket, s3Key);
        console.log(`[download] Deleted s3://${bucket}/${s3Key}`);
    }
}

/** Upload a local file to an EC2 instance via S3 + SSM. */
export async function uploadFile(
    creds: S3Credentials,
    bucket: string,
    instanceId: string,
    remotePath: string,
    opts?: { title?: string },
): Promise<void> {
    const selected = await open({
        multiple: false,
        title: opts?.title ?? "Select File to Upload",
    });

    if (!selected) return;

    const localPath = selected;
    const filename = localPath.split(/[\\/]/).pop() ?? "upload";
    const s3Key = `ecscope/${instanceId}/uploads/${Date.now()}-${filename}`;

    console.log(`[upload] Reading local file ${localPath} ...`);
    const data = await readFile(localPath);

    console.log(`[upload] Uploading to s3://${bucket}/${s3Key} ...`);
    await uploadToS3(creds, bucket, s3Key, data);

    const dest = remotePath.endsWith("/") ? `${remotePath}${filename}` : remotePath;

    const commands = [
        `set -e`,
        `export AWS_ACCESS_KEY_ID="${creds.accessKeyId}"`,
        `export AWS_SECRET_ACCESS_KEY="${creds.secretAccessKey}"`,
        `export AWS_DEFAULT_REGION="${creds.region}"`,
        `aws s3 cp "s3://${bucket}/${s3Key}" "${dest}"`,
        `aws s3 rm "s3://${bucket}/${s3Key}"`,
        `echo "UPLOADED=${dest}"`,
    ];

    console.log(`[upload] SSM: pulling file to ${dest} on ${instanceId} ...`);
    await sendSsmCommand(instanceId, commands, 120);
    console.log(`[upload] Done. File available at ${dest} on ${instanceId}`);
}
