import { router } from 'expo-router';
import { LocationPicker } from '@/features/location/location-picker';

export default function CustomerLocationsScreen() {
  return <LocationPicker onDone={() => router.back()} />;
}
