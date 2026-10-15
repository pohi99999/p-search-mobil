import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { STALE_MATCH_STATUS } from '../lib/matchStatus';

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
}

export function MatchCard({ item, onPress }: MatchCardProps) {
  // Card 2428c38f: a match the latest scan did not re-score says so, instead of showing an old
  // reasoning (written for an older profile) next to the fresh ones.
  const stale = item.status === STALE_MATCH_STATUS;
  return (
    <Card style={[styles.card, stale && styles.staleCard]} mode="elevated">
      <Card.Title
        title={item.grants?.title || 'Ismeretlen pályázat'}
        subtitle={stale ? `Korábbi keresés találata (egyezés akkor: ${item.match_score}%)` : `Egyezés: ${item.match_score}%`}
        subtitleStyle={stale ? styles.staleSubtitle : undefined}
      />
      <Card.Content>
        <Text variant="bodyMedium" style={{ marginBottom: 8, color: '#444' }}>
          {item.grants?.provider}
        </Text>
        <Text variant="bodySmall">
          {item.match_reasoning || item.grants?.description}
        </Text>
        {(item.grants?.amount_min || item.grants?.amount_max) && (
          <Text variant="labelLarge" style={{ marginTop: 8, color: '#1976D2' }}>
            Összeg: {item.grants.amount_min ? `${item.grants.amount_min.toLocaleString('hu-HU')} Ft` : '0 Ft'} - {item.grants.amount_max ? `${item.grants.amount_max.toLocaleString('hu-HU')} Ft` : '? Ft'}
          </Text>
        )}
      </Card.Content>
      <Card.Actions>
        <Button onPress={onPress}>Részletek</Button>
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
  staleCard: {
    opacity: 0.75,
  },
  staleSubtitle: {
    color: '#9E9E9E',
  },
});
