// ECS API - uses real AWS SDK when connected, falls back to mock
import { mockApi } from "./mock";
import { awsApi, initAwsClients } from "./aws";
import { useConfigStore } from "@/store/config";

export type * from "./types";
export { initAwsClients };

type EcsApiType = typeof mockApi;

function createProxy(): EcsApiType {
    return new Proxy(mockApi, {
        get(_target, prop: keyof EcsApiType) {
            const { status } = useConfigStore.getState();
            const usingAws = status === "connected";
            console.log(`[api-proxy] ${String(prop)} → ${usingAws ? "AWS" : "MOCK"} (status=${status})`);
            if (usingAws) {
                return awsApi[prop];
            }
            return mockApi[prop];
        },
    });
}

export const ecsApi = createProxy();
