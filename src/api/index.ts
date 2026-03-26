import { awsApi, initAwsClients } from "./aws";
import * as ssmDiagnostics from "./ssm-diagnostics";

export type * from "./types";
export { initAwsClients };

export const ecsApi = awsApi;

export const diagnosticsApi = ssmDiagnostics;
