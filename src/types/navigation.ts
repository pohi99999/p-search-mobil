import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MatchWithGrant } from '../hooks/useHomeData';
import type { PaywallSource } from '../services/events';

export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  Onboarding: { edit?: boolean } | undefined;
  // [G2]: where it was opened from, for the paywall_view event.
  Paywall: { source?: PaywallSource } | undefined;
  Settings: undefined;
  DocumentUpload: undefined;
  ActionPlan: {
    matchId: string;
    businessProfileId?: string;
  };
  CopilotChat: { matchId?: string } | undefined;
  // Card [B]: the match as the home list loaded it (grants(*) included), so the view needs no query.
  // [G2]: rank = its 1-based position in the home list, for the match_open / match_feedback events.
  GrantDetail: { match: MatchWithGrant; rank?: number };
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type ActionPlanScreenRouteProp = RouteProp<RootStackParamList, 'ActionPlan'>;
export type CopilotChatScreenRouteProp = RouteProp<RootStackParamList, 'CopilotChat'>;

export type ActionPlanScreenProps = NativeStackScreenProps<RootStackParamList, 'ActionPlan'>;
export type GrantDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'GrantDetail'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type DocumentUploadScreenProps = NativeStackScreenProps<RootStackParamList, 'DocumentUpload'>;
