import {
  AirVent,
  AlertTriangle,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock3,
  Droplets,
  Hammer,
  House,
  ImagePlus,
  Lightbulb,
  MapPin,
  MessageCircle,
  Mic,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { View } from 'react-native';

export type AppIconName =
  | 'air-conditioning'
  | 'alert'
  | 'bell'
  | 'calendar'
  | 'camera'
  | 'check'
  | 'chevron-back'
  | 'chevron-forward'
  | 'customer'
  | 'electrical'
  | 'handyman'
  | 'home'
  | 'image'
  | 'lighting'
  | 'location'
  | 'messages'
  | 'microphone'
  | 'navigation'
  | 'plumbing'
  | 'plus'
  | 'refresh'
  | 'requests'
  | 'search'
  | 'send'
  | 'shield'
  | 'sparkles'
  | 'star'
  | 'time'
  | 'tools'
  | 'close';

const iconMap: Record<AppIconName, LucideIcon> = {
  'air-conditioning': AirVent,
  alert: AlertTriangle,
  bell: Bell,
  calendar: CalendarDays,
  camera: Camera,
  check: Check,
  'chevron-back': ChevronLeft,
  'chevron-forward': ChevronRight,
  customer: CircleUserRound,
  electrical: Zap,
  handyman: Hammer,
  home: House,
  image: ImagePlus,
  lighting: Lightbulb,
  location: MapPin,
  messages: MessageCircle,
  microphone: Mic,
  navigation: Navigation,
  plumbing: Droplets,
  plus: Plus,
  refresh: RefreshCw,
  requests: ClipboardList,
  search: Search,
  send: Send,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  time: Clock3,
  tools: Wrench,
  close: X,
};

export function categoryIconName(iconKey: string, slug: string): AppIconName {
  const value = `${iconKey} ${slug}`.toLowerCase();
  if (/air|cool|hvac|conditioning/.test(value)) return 'air-conditioning';
  if (/plumb|water|pipe/.test(value)) return 'plumbing';
  if (/electric|power|wire/.test(value)) return 'electrical';
  if (/light|lamp/.test(value)) return 'lighting';
  if (/repair|tool|maintenance/.test(value)) return 'tools';
  return 'handyman';
}

export function AppIcon({
  name,
  color,
  size = 22,
  strokeWidth = 2,
  testID,
}: {
  name: AppIconName;
  color: string;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}) {
  const Icon = iconMap[name];
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" testID={testID}>
      <Icon color={color} size={size} strokeWidth={strokeWidth} />
    </View>
  );
}
