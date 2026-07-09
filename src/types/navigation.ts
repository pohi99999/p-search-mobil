import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Paywall: undefined;
  ActionPlan: {
    matchId: string;
    businessProfileId?: string;
  };
  CopilotChat: { matchId?: string } | undefined;
};

export type RootStackNavigationProp = NativeStackNavigationProp<RootStackParamList>;
export type ActionPlanScreenRouteProp = RouteProp<RootStackParamList, 'ActionPlan'>;
export type CopilotChatScreenRouteProp = RouteProp<RootStackParamList, 'CopilotChat'>;

export type ActionPlanScreenProps = NativeStackScreenProps<RootStackParamList, 'ActionPlan'>;
