import type { IconName } from './Icon';

export type NavKey = 'home' | 'exams' | 'insights' | 'people' | 'skills' | 'account';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  icon: IconName;
  isNew?: boolean;
}

export function navItems(isStaff: boolean): NavItem[] {
  if (isStaff) {
    return [
      { key: 'home', href: '#/', label: 'Overview', icon: 'home' },
      { key: 'exams', href: '#/exams', label: 'Exams', icon: 'exams' },
      { key: 'insights', href: '#/insights', label: 'Mistake Map', icon: 'map', isNew: true },
      { key: 'people', href: '#/people', label: 'People', icon: 'people' },
    ];
  }
  return [
    { key: 'home', href: '#/', label: 'Home', icon: 'home' },
    { key: 'exams', href: '#/exams', label: 'My exams', icon: 'exams' },
    { key: 'skills', href: '#/skills', label: 'Skill Map', icon: 'target', isNew: true },
  ];
}
