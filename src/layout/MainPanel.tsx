import { useNavigationStore } from "@/store/navigation";
import { Breadcrumb } from "./Breadcrumb";
import { TabBar } from "./TabBar";
import { ServiceList } from "@/features/services/ServiceList";
import { TaskList } from "@/features/tasks/TaskList";
import { AlbNlbViewer } from "@/features/albnlb/AlbNlbViewer";
import { NodeViewer } from "@/features/nodes/NodeViewer";
import { DatabaseDashboard } from "@/features/database/DatabaseDashboard";
import { WelcomeView } from "@/features/welcome/WelcomeView";

export function MainPanel() {
  const { selectedCluster, activeTab } = useNavigationStore();

  if (!selectedCluster) {
    return <WelcomeView />;
  }

  return (
    <div className="flex h-full flex-col">
      <Breadcrumb />
      <TabBar />
      <div className="flex-1 overflow-auto">
        {activeTab === "services" && <ServiceList />}
        {activeTab === "tasks" && <TaskList />}
        {activeTab === "albnlb" && <AlbNlbViewer />}
        {activeTab === "nodes" && <NodeViewer />}
        {activeTab === "database" && <DatabaseDashboard />}
      </div>
    </div>
  );
}
