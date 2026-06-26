import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Auth: undefined;
  Home: undefined;
  Onboarding: undefined;
  Paywall: undefined;
  ActionPlan: {
    matchId?: string;
    businessProfileId?: string;
  };
  CopilotChat: undefined;
};

export type ActionPlanScreenProps = NativeStackScreenProps<RootStackParamList, 'ActionPlan'>;
