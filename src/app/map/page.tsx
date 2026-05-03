import { HomeMapView } from '@/components/map/HomeMapView';
import { PerfOverlay } from '@/components/perf/PerfOverlay';

export default function MapPage() {
  return (
    <>
      <HomeMapView />
      <PerfOverlay />
    </>
  );
}
