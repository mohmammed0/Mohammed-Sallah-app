import { Redirect } from 'expo-router';
import { productLandingRoute } from '@/features/auth/route-policy';
import { useSessionContext } from '@/providers/session-provider';

export default function Home() {
  const { context } = useSessionContext();
  return <Redirect href={productLandingRoute(context)} />;
}
