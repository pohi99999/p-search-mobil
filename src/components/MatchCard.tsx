import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, Button, TouchableRipple } from 'react-native-paper';
import type { MatchWithGrant } from '../hooks/useHomeData';
import { formatGrantAmount } from '../lib/grantAmount';
import { grantKindLabel } from '../lib/grantKind';
import { STALE_MATCH_STATUS } from '../lib/matchStatus';
import { formatDeadline } from '../lib/deadline';
import { GrantKindBadge } from './GrantKindBadge';
import { MatchFeedback } from './MatchFeedback';

// The round search button floats over the list's right edge: 56 px wide with a 16 px margin, and the card itself has
// a 16 px margin. The actions keep out of that column at any scroll position, on any screen width (P2-3).
const SEARCH_BUTTON_GUTTER = 64;

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
  /** [G2]: 1-based position in the list; with it the card shows the feedback buttons. */
  rank?: number;
}

export function MatchCard({ item, onPress, rank }: MatchCardProps) {
  // Card 378073ce: no invented ranges (placeholder 1 Ft minimum, programme budget as maximum).
  const amountLine = formatGrantAmount(item.grants?.amount_min, item.grants?.amount_max);
  // Card 2428c38f: a match the latest scan did not re-score says so, instead of showing an old
  // reasoning (written for an older profile) next to the fresh ones.
  const stale = item.status === STALE_MATCH_STATUS;
  // Card [A]: the deadline is the first thing to decide on; expired in red, under 14 days highlighted.
  const deadline = formatDeadline(item.grants?.deadline);
  const hasKind = grantKindLabel(item.grants?.grant_type) !== null;
  return (
    <Card style={[styles.card, stale && styles.staleCard]} mode="elevated">
      {/* Péter's test 2026-11-07 (P2-2): only "Részletek" opened the view, a tap on the title did nothing. The buttons
          stay outside this area, so no button sits inside another one. */}
      <TouchableRipple
        onPress={onPress}
        borderless
        style={styles.openArea}
        accessibilityRole="button"
        accessibilityHint="Megnyitja a részleteket"
        testID="match-card-open"
      >
        <View>
          <GrantKindBadge grantType={item.grants?.grant_type} style={styles.kind} />
          <Card.Title
            title={item.grants?.title || 'Ismeretlen pályázat'}
            titleNumberOfLines={2}
            style={hasKind ? styles.titleAfterKind : styles.title}
            subtitle={stale ? `Korábbi keresés találata (egyezés akkor: ${item.match_score}%)` : `Egyezés: ${item.match_score}%`}
            // Péter's test 2026-11-07: the stale line was cut at "egyezés akk...", before the number it is there for.
            subtitleNumberOfLines={3}
            subtitleStyle={stale ? styles.staleSubtitle : undefined}
          />
          <Card.Content style={styles.content}>
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
        </View>
      </TouchableRipple>
      {/* [G2]: the feedback answer sits in the actions row, before "Részletek"; on a narrow screen the row wraps and
          "Részletek" stays at the right. Card.Actions would make its 2nd child a contained button, hence the explicit mode. */}
      <Card.Actions style={styles.actions}>
        {rank !== undefined && (
          <MatchFeedback
            matchId={item.id}
            grantId={item.grant_id}
            score={item.match_score}
            rank={rank}
            initial={item.feedback ?? null}
            style={styles.feedback}
          />
        )}
        {/* Card [J]: every card's button read "Részletek"; the label names the grant. Round 2 (Lumen P2-6): the
            visible word comes first, so voice control finds the button by what it shows. */}
        <Button
          mode="outlined"
          onPress={onPress}
          accessibilityLabel={`Részletek: ${item.grants?.title || 'Ismeretlen pályázat'}`}
          style={styles.details}
        >
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
  titleAfterKind: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  kind: {
    marginTop: 12,
    marginLeft: 16,
  },
  // The ripple follows the card's rounded top corners.
  openArea: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  // Card.Content takes this padding from its siblings in the card, and inside the open area it has none.
  content: {
    paddingBottom: 8,
  },
  staleCard: {
    opacity: 0.75,
  },
  // Round 2 (Lumen P2-7): #9E9E9E was 2.67:1, and the stale card adds opacity 0.75; #424242 stays about 4.8:1 under it.
  staleSubtitle: {
    color: '#424242',
  },
  deadline: {
    marginBottom: 8,
  },
  actions: {
    flexWrap: 'wrap',
    rowGap: 8,
    paddingLeft: 8,
    paddingRight: SEARCH_BUTTON_GUTTER,
  },
  // Card.Actions pads 8 px, Card.Content 16 px: the extra 8 px lines the buttons up with the card text.
  feedback: {
    marginTop: 0,
    marginLeft: 8,
    marginRight: 'auto',
    // On a narrow screen the two buttons wrap under each other, instead of running out at the card's left edge.
    flexShrink: 1,
  },
  details: {
    marginLeft: 'auto',
  },
});

// Contrast on the white card: #B71C1C 6.57:1, #A15C00 5.19:1 (amber, apart from the red), #424242 10.4:1, #616161 6.19:1.
const deadlineStyles = StyleSheet.create({
  expired: { color: '#B71C1C', fontWeight: 'bold' },
  soon: { color: '#A15C00', fontWeight: 'bold' },
  normal: { color: '#424242' },
  unknown: { color: '#616161', fontWeight: 'normal' },
});
