import { create } from "zustand";

interface NavigationState {
  selectedCluster: string | null;
  selectedService: string | null;
  selectedTaskArn: string | null;
  activeTab: "services" | "tasks" | "logs";
  sidebarCollapsed: boolean;

  selectCluster: (clusterName: string) => void;
  selectService: (serviceName: string) => void;
  selectTask: (taskArn: string) => void;
  setActiveTab: (tab: NavigationState["activeTab"]) => void;
  toggleSidebar: () => void;
  goBack: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedCluster: null,
  selectedService: null,
  selectedTaskArn: null,
  activeTab: "services",
  sidebarCollapsed: false,

  selectCluster: (clusterName) =>
    set({ selectedCluster: clusterName, selectedService: null, selectedTaskArn: null, activeTab: "services" }),

  selectService: (serviceName) =>
    set({ selectedService: serviceName, selectedTaskArn: null, activeTab: "tasks" }),

  selectTask: (taskArn) =>
    set({ selectedTaskArn: taskArn, activeTab: "logs" }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  goBack: () =>
    set((s) => {
      if (s.selectedTaskArn) return { selectedTaskArn: null, activeTab: "tasks" };
      if (s.selectedService) return { selectedService: null, activeTab: "services" };
      return {};
    }),
}));
