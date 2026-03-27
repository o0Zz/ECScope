import { useState, useCallback } from "react";
import type { S3Credentials } from "@/api/types";
import type { StorageConfig, ClusterConfig } from "@/config/config";
import { copyFileFromEc2ToS3, copyFileFromS3ToEc2 } from "@/api/ec2";
import { downloadFromS3, deleteFromS3, uploadToS3 } from "@/api/s3";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeFile, readFile } from "@tauri-apps/plugin-fs";
import { createLogger } from "@/lib/logger";

const logger = createLogger("FileTransfer");

type TransferMode = "download" | "upload";

interface FileTransferState {
    /** Which dialog is shown */
    mode: TransferMode | null;
    /** Target EC2 instance */
    instanceId: string | null;
    /** Whether a transfer is in progress */
    isPending: boolean;
    /** Error from the last transfer attempt */
    error: string | null;
}

export function useFileTransfer(storage: StorageConfig | null, activeCluster: ClusterConfig | null) {
    const [state, setState] = useState<FileTransferState>({
        mode: null,
        instanceId: null,
        isPending: false,
        error: null,
    });

    const hasFileTransfer = !!(storage?.s3Bucket && storage?.s3AccessKeyId && storage?.s3SecretAccessKey);

    const getS3Creds = (): S3Credentials => ({
        accessKeyId: storage!.s3AccessKeyId!,
        secretAccessKey: storage!.s3SecretAccessKey!,
        region: storage?.s3Region ?? activeCluster?.region ?? "us-east-1",
    });

    const startDownload = useCallback((instanceId: string) => {
        setState({ mode: "download", instanceId, isPending: false, error: null });
    }, []);

    const startUpload = useCallback((instanceId: string) => {
        setState({ mode: "upload", instanceId, isPending: false, error: null });
    }, []);

    const cancel = useCallback(() => {
        setState({ mode: null, instanceId: null, isPending: false, error: null });
    }, []);

    const confirmDownload = useCallback(async (remotePath: string) => {
        const instanceId = state.instanceId;
        if (!instanceId) return;

        const filename = remotePath.split("/").pop() ?? "download";
        const ext = filename.includes(".") ? filename.split(".").pop()! : "*";
        const savePath = await save({
            defaultPath: filename,
            filters: [{ name: "File", extensions: [ext] }],
            title: "Save File",
        });
        if (!savePath) return;

        setState((s) => ({ ...s, isPending: true, error: null }));
        try {
            const creds = getS3Creds();
            const s3Key = await copyFileFromEc2ToS3({
                instanceId,
                credentials: creds,
                s3Bucket: storage!.s3Bucket!,
                remoteFileGlob: remotePath,
            });
            const data = await downloadFromS3(creds, storage!.s3Bucket!, s3Key);
            await writeFile(savePath, data);
            await deleteFromS3(creds, storage!.s3Bucket!, s3Key);
            setState({ mode: null, instanceId: null, isPending: false, error: null });
        } catch (err) {
            logger.error(`Download from ${instanceId} failed`, err);
            setState((s) => ({
                ...s,
                isPending: false,
                error: `Download failed: ${err instanceof Error ? err.message : String(err)}`,
            }));
        }
    }, [state.instanceId, storage, activeCluster]);

    const confirmUpload = useCallback(async (remotePath: string) => {
        const instanceId = state.instanceId;
        if (!instanceId) return;

        const localPath = await open({
            multiple: false,
            title: "Select File to Upload",
        });
        if (!localPath) return;

        setState((s) => ({ ...s, isPending: true, error: null }));
        try {
            const creds = getS3Creds();
            const filename = localPath.split(/[\\/]/).pop() ?? "upload";
            const s3Key = `ecscope/${instanceId}/uploads/${Date.now()}-${filename}`;
            const data = await readFile(localPath);
            await uploadToS3(creds, storage!.s3Bucket!, s3Key, data);
            const dest = remotePath.endsWith("/") ? `${remotePath}${filename}` : remotePath;
            await copyFileFromS3ToEc2({
                instanceId,
                credentials: creds,
                s3Bucket: storage!.s3Bucket!,
                s3Key,
                remotePath: dest,
            });
            setState({ mode: null, instanceId: null, isPending: false, error: null });
        } catch (err) {
            logger.error(`Upload to ${instanceId} failed`, err);
            setState((s) => ({
                ...s,
                isPending: false,
                error: `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
            }));
        }
    }, [state.instanceId, storage, activeCluster]);

    const confirm = useCallback(async (value: string) => {
        if (state.mode === "download") await confirmDownload(value);
        else if (state.mode === "upload") await confirmUpload(value);
    }, [state.mode, confirmDownload, confirmUpload]);

    return {
        hasFileTransfer,
        dialogOpen: state.mode !== null,
        dialogMode: state.mode,
        isPending: state.isPending,
        error: state.error,
        startDownload,
        startUpload,
        cancel,
        confirm,
    };
}
