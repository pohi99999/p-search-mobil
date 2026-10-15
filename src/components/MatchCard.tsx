import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { MatchWithGrant } from '../hooks/useHomeData';
import { formatGrantAmount } from '../lib/grantAmount';

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
}

export function MatchCard({ item, onPress }: MatchCardProps) {
  // Card 378073ce: no invented ranges (placeholder 1 Ft minimum, programme budget as maximum).
  const amountLine = formatGrantAmount(item.grants?.amount_min, item.grants?.amount_max);
  return (
    <Card style={styles.card} mode="elevated">
      <Card.Title title={item.grants?.title || 'Ismeretlen pályázat'} subtitle={`Egyezés: ${item.match_score}%`} />
      <Card.Content>
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
});
