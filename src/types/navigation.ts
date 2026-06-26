export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  Onboarding: undefined;
  Paywall: undefined;
  ActionPlan: { matchId: string };
  CopilotChat: { matchId?: string } | undefined;
};
