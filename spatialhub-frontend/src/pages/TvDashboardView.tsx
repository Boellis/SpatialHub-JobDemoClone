import { useSimSource } from '../hooks/useSimSource';
import { useLiveSensors } from '../hooks/useLiveSensors';
import { StatusBar } from '../components/tv/StatusBar';
import { PriorityGrid } from '../components/tv/PriorityGrid';

const TvDashboardView = () => {
  useSimSource();
  useLiveSensors();

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#06070b', overflow: 'hidden' }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <StatusBar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <PriorityGrid />
        </div>
      </div>
    </div>
  );
};

export default TvDashboardView;
