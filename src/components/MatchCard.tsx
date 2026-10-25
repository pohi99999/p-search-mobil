import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { formatGrantAmount } from '../lib/grantAmount';
import { STALE_MATCH_STATUS } from '../lib/matchStatus';
import { formatDeadline } from '../lib/deadline';

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
}

export function MatchCard({ item, onPress }: MatchCardProps) {
  // Card 378073ce: no invented ranges (placeholder 1 Ft minimum, programme budget as maximum).
  const amountLine = formatGrantAmount(item.grants?.amount_min, item.grants?.amount_max);
  // Card 2428c38f: a match the latest scan did not re-score says so, instead of showing an old
  // reasoning (written for an older profile) next to the fresh ones.
  const stale = item.status === STALE_MATCH_STATUS;
  // Card [A]: the deadline is the first thing to decide on; expired in red, under 14 days highlighted.
  const deadline = formatDeadline(item.grants?.deadline);
  return (
    <Card style={[styles.card, stale && styles.staleCard]} mode="elevated">
      <Card.Title
        title={item.grants?.title || 'Ismeretlen pályázat'}
        titleNumberOfLines={2}
        style={styles.title}
        subtitle={stale ? `Korábbi keresés találata (egyezés akkor: ${item.match_score}%)` : `Egyezés: ${item.match_score}%`}
        subtitleStyle={stale ? styles.staleSubtitle : undefined}
      />
      <Card.Content>
        <Text
          variant="labelLarge"
          style={[styles.deadline, deadlineStyles[deadline.tone]]}
          testID="match-deadline"
        >
          {deadline.label}
        </Text>
        <Text variant="bodyMedium" style={{ marginBottom: 8, color: '#444' }}>
          {item.grants?.provider}
        </Text>
        <Text variant="bodySmall">
          {item.match_reasoning || item.grants?.description}
        </Text>
        {amountLine && (
          <Text variant="labelLarge" style={{ marginTop: 8, color: '#1976D2' }}>
            Összeg: {amountLine}
          </Text>
        )}
      </Card.Content>
      <Card.Actions>
        {/* Card [J]: every card's button read "Részletek"; the label names the grant. */}
        <Button onPress={onPress} accessibilityLabel={`${item.grants?.title || 'Ismeretlen pályázat'} részletei`}>
          Részletek
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'white',
  },
  // Card.Title centres its content in a fixed 72 px row; a 2-line title touched the card's top edge.
  title: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  staleCard: {
    opacity: 0.75,
  },
  staleSubtitle: {
    color: '#9E9E9E',
  },
  deadline: {
    marginBottom: 8,
  },
});

// Contrast on the white card: #B71C1C 6.57:1, #A15C00 5.19:1 (amber, apart from the red), #424242 10.4:1, #616161 6.19:1.
const deadlineStyles = StyleSheet.create({
  expired: { color: '#B71C1C', fontWeight: 'bold' },
  soon: { color: '#A15C00', fontWeight: 'bold' },
  normal: { color: '#424242' },
  unknown: { color: '#616161', fontWeight: 'normal' },
});
