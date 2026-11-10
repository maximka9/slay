import { MessageSquareText, Sparkles, Gamepad2, Zap, Wine, ChefHat, Play, Smile } from 'lucide-react';
import type { Category } from '../data/awards';
const icons = { message: MessageSquareText, sparkles: Sparkles, gamepad: Gamepad2, zap: Zap, glass: Wine, chef: ChefHat, play: Play, smile: Smile };
export function CategoryIcon({ name, size = 24 }: { name: Category['icon']; size?: number }) {
  const Icon = icons[name];
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
