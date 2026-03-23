import { Sidebar } from "@/layout/Sidebar";
import { MainPanel } from "@/layout/MainPanel";

export default function App() {
  return (
    <div className="dark flex h-screen w-screen">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        <MainPanel />
      </main>
    </div>
  );
}
