import { DashboardProvider } from '@/contexts/dashboard-context';
import Dashboard from '@/components/Dashboard';

function App() {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  );
}

export default App;
