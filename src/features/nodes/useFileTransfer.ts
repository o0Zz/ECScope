import { useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ClusterConfig } from "@/config/config";
import { execSsmCommand } from "@/api/ssm";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke, createLogger } from "@/lib/logger";

const logger = createLogger("FileTransfer");

type TransferMode = "download" | "upload";

interface FileTransferState {
    mode: TransferMode | null;
    instanceId: string | null;
    isPending: boolean;
    error: string | null;
    /** 0–100, null while connecting (before first byte) */
    progress: number | null;
    /** e.g. "1.4 MB/s", null while connecting */
    rate: string | null;
}

export function useFileTransfer(activeCluster: ClusterConfig | null) {
    const [state, setState] = useState<FileTransferState>({
        mode: null,
        instanceId: null,
        isPending: false,
        error: null,
        progress: null,
        rate: null,
    });

    const startDownload = useCallback((instanceId: string) => {
        setState({ mode: "download", instanceId, isPending: false, error: null, progress: null, rate: null });
    }, []);

    const startUpload = useCallback((instanceId: string) => {
        setState({ mode: "upload", instanceId, isPending: false, error: null, progress: null, rate: null });
    }, []);

    const cancel = useCallback(() => {
        // Tell Rust to abort the in-progress transfer (no-op if none is running)
        invoke("cancel_transfer", {}).catch(() => {});
        setState({ mode: null, instanceId: null, isPending: false, error: null, progress: null, rate: null });
    }, []);

    const confirmDownload = useCallback(
        async (remotePath: string) => {
            const instanceId = state.instanceId;
            if (!instanceId || !activeCluster) return;

            const filename = remotePath.split("/").pop() ?? "download";
            const ext = filename.includes(".") ? filename.split(".").pop()! : "*";
            const savePath = await save({
                defaultPath: filename,
                filters: [{ name: "File", extensions: [ext] }],
                title: "Save File",
            });
            if (!savePath) return;

            setState((s) => ({ ...s, isPending: true, error: null, progress: null, rate: null }));
            const sshUser = activeCluster.sshUser ?? "ec2-user";

            // Listen for progress events emitted by Rust during the transfer
            const unlisten = await listen<{ percent: number; rate: string }>("sftp-progress", (event) => {
                setState((s) => ({ ...s, progress: event.payload.percent, rate: event.payload.rate }));
            });

            try {
                const { keyId, publicKey, privateKeyPath } = await invoke<{
                    keyId: string;
                    publicKey: string;
                    privateKeyPath: string;
                }>("generate_ssh_keypair");

                await execSsmCommand(instanceId, [
                    "set -e",
                    `mkdir -p /home/${sshUser}/.ssh`,
                    `chmod 700 /home/${sshUser}/.ssh`,
                    `echo "${publicKey}" >> /home/${sshUser}/.ssh/authorized_keys`,
                    `chmod 600 /home/${sshUser}/.ssh/authorized_keys`,
                    `chown -R ${sshUser}:${sshUser} /home/${sshUser}/.ssh`,
                ]);

                try {
                    await invoke("sftp_download", {
                        params: {
                            instanceId,
                            profile: activeCluster.profile,
                            region: activeCluster.region ?? "us-east-1",
                            remotePath,
                            localPath: savePath,
                            privateKeyPath,
                            username: sshUser,
                        },
                    });
                } finally {
                    await execSsmCommand(instanceId, [
                        `sed -i "/${keyId}/d" /home/${sshUser}/.ssh/authorized_keys 2>/dev/null || true`,
                    ]).catch((e) => logger.warn("SSH key cleanup failed (non-fatal)", e));
                }

                setState({ mode: null, instanceId: null, isPending: false, error: null, progress: null, rate: null });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg === "Transfer cancelled") return;
                logger.error(`Download from ${instanceId} failed`, err);
                setState((s) => ({ ...s, isPending: false, error: `Download failed: ${msg}` }));
            } finally {
                unlisten();
            }
        },
        [state.instanceId, activeCluster],
    );

    const confirmUpload = useCallback(
        async (remotePath: string) => {
            const instanceId = state.instanceId;
            if (!instanceId || !activeCluster) return;

            const localPath = await open({ multiple: false, title: "Select File to Upload" });
            if (!localPath) return;

            setState((s) => ({ ...s, isPending: true, error: null, progress: null, rate: null }));
            const sshUser = activeCluster.sshUser ?? "ec2-user";

            const unlisten = await listen<{ percent: number; rate: string }>("sftp-progress", (event) => {
                setState((s) => ({ ...s, progress: event.payload.percent, rate: event.payload.rate }));
            });

            try {
                const { keyId, publicKey, privateKeyPath } = await invoke<{
                    keyId: string;
                    publicKey: string;
                    privateKeyPath: string;
                }>("generate_ssh_keypair");

                await execSsmCommand(instanceId, [
                    "set -e",
                    `mkdir -p /home/${sshUser}/.ssh`,
                    `chmod 700 /home/${sshUser}/.ssh`,
                    `echo "${publicKey}" >> /home/${sshUser}/.ssh/authorized_keys`,
                    `chmod 600 /home/${sshUser}/.ssh/authorized_keys`,
                    `chown -R ${sshUser}:${sshUser} /home/${sshUser}/.ssh`,
                ]);

                const dest = remotePath.endsWith("/")
                    ? `${remotePath}${(localPath as string).split(/[\\/]/).pop() ?? "upload"}`
                    : remotePath;

                try {
                    await invoke("sftp_upload", {
                        params: {
                            instanceId,
                            profile: activeCluster.profile,
                            region: activeCluster.region ?? "us-east-1",
                            remotePath: dest,
                            localPath: localPath as string,
                            privateKeyPath,
                            username: sshUser,
                        },
                    });
                } finally {
                    await execSsmCommand(instanceId, [
                        `sed -i "/${keyId}/d" /home/${sshUser}/.ssh/authorized_keys 2>/dev/null || true`,
                    ]).catch((e) => logger.warn("SSH key cleanup failed (non-fatal)", e));
                }

                setState({ mode: null, instanceId: null, isPending: false, error: null, progress: null, rate: null });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg === "Transfer cancelled") return;
                logger.error(`Upload to ${instanceId} failed`, err);
                setState((s) => ({ ...s, isPending: false, error: `Upload failed: ${msg}` }));
            } finally {
                unlisten();
            }
        },
        [state.instanceId, activeCluster],
    );

    const confirm = useCallback(
        async (value: string) => {
            if (state.mode === "download") await confirmDownload(value);
            else if (state.mode === "upload") await confirmUpload(value);
        },
        [state.mode, confirmDownload, confirmUpload],
    );

    return {
        hasFileTransfer: !!activeCluster,
        dialogOpen: state.mode !== null,
        dialogMode: state.mode,
        isPending: state.isPending,
        progress: state.progress,
        rate: state.rate,
        error: state.error,
        startDownload,
        startUpload,
        cancel,
        confirm,
    };
}
