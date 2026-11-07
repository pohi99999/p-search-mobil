import type { RootStackParamList } from '../types/navigation';

/**
 * Review 2026-11-03: on web React Navigation names the browser tab after `options.title`, falling back to
 * the route name, so the sign-in tab read "Auth". Hungarian titles for every screen. Native hides the
 * header (headerShown: false), so these show only in the browser tab. No en or em dash: "|" separates.
 */
export const SCREEN_TITLES: Record<keyof RootStackParamList, string> = {
  Auth: 'Belépés | P-Search',
  Home: 'Kezdőlap | P-Search',
  Onboarding: 'Cégprofil | P-Search',
  Paywall: 'Előfizetés | P-Search',
  Settings: 'Beállítások | P-Search',
  DocumentUpload: 'Dokumentum feltöltése | P-Search',
  GrantDetail: 'Részletek | P-Search',
  ActionPlan: 'Akcióterv | P-Search',
  CopilotChat: 'AI pályázati Copilot | P-Search',
};
