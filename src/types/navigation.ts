import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { MatchWithGrant } from '../hooks/useHomeData';

export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  Onboarding: { edit?: boolean } | undefined;
  Paywall: undefined;
  Settings: undefined;
  DocumentUpload: undefined;
  ActionPlan: {
    matchId: string;
    businessProfileId?: string;
  };
  CopilotChat: { matchId?: string } | undefined;
  // Card [B]: the match as the home list loaded it (grants(*) included), so the view needs no query.
  GrantDetail: { match: MatchWithGrant };
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type ActionPlanScreenRouteProp = RouteProp<RootStackParamList, 'ActionPlan'>;
export type CopilotChatScreenRouteProp = RouteProp<RootStackParamList, 'CopilotChat'>;

export type ActionPlanScreenProps = NativeStackScreenProps<RootStackParamList, 'ActionPlan'>;
export type GrantDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'GrantDetail'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type DocumentUploadScreenProps = NativeStackScreenProps<RootStackParamList, 'DocumentUpload'>;
