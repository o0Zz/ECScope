/** Dedicated S3 credentials for diagnostic file transfer */
export interface S3Credentials {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
}

export interface TcpdumpParams {
    instanceId: string;
    s3Bucket: string;
    /** Dedicated S3 credentials for the upload */
    credentials: S3Credentials;
    /** Capture duration in seconds (default: 30) */
    duration?: number;
    /** Network interface (default: "any") */
    iface?: string;
    /** Optional BPF filter expression (e.g. "port 80") */
    filter?: string;
}

export interface CoredumpParams {
    instanceId: string;
    s3Bucket: string;
    /** Dedicated S3 credentials for the upload */
    credentials: S3Credentials;
    /** PID of the process to dump */
    pid: number;
}
