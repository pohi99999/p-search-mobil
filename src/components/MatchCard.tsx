import React from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import { MatchWithGrant } from '../hooks/useHomeData';

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
}

export function MatchCard({ item, onPress }: MatchCardProps) {
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
});
