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
import { BRAND_BLUE } from '../config/brand';

// The round search button floats over the list's right edge: 56 px wide with a 16 px margin, and the card itself has
// a 16 px margin. The actions keep out of that column at any scroll position, on any screen width (P2-3).
const SEARCH_BUTTON_GUTTER = 64;

/** Round 11-21 (#2): the "Új" label's background; white text on it. */
export const NEW_BADGE_BG = '#0B3D85';

interface MatchCardProps {
  item: MatchWithGrant;
  onPress: () => void;
  /** [G2]: 1-based position in the list; with it the card shows the feedback buttons. */
  rank?: number;
  /** Round 11-21 (#2): the match came in after the user's previous visit; the card says "Új". */
  isNew?: boolean;
}

/**
 * The stale card's own background (round 6 follow-up, Ellenőr 9293). The card used to fade with opacity 0.75, and every
 * text on it faded too: four of its eight text colours fell under AA (the "soon" deadline 3.28:1, the amount and the
 * buttons' blue 3.56:1). Now the card keeps full colours on this cool grey, and every text colour on it is at least
 * 4.79:1 (MatchCard test). The text says it is an older result ("Korábbi keresés találata"), the outline marks the card.
 */
export const STALE_CARD_BG = '#F4F6F9';

export function MatchCard({ item, onPress, rank, isNew = false }: MatchCardProps) {
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
          {hasKind || isNew ? (
            <View style={styles.badges}>
              {isNew && (
                <View
                  style={styles.newBadge}
                  testID="match-new-badge"
                  accessible
                  accessibilityLabel="Új találat a legutóbbi látogatásod óta"
                >
                  <Text variant="labelMedium" style={styles.newBadgeText}>
                    Új
                  </Text>
                </View>
              )}
              <GrantKindBadge grantType={item.grants?.grant_type} />
            </View>
          ) : null}
          <Card.Title
            title={item.grants?.title || 'Ismeretlen pályázat'}
            titleNumberOfLines={2}
            style={hasKind || isNew ? styles.titleAfterKind : styles.title}
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
              <Text variant="labelLarge" style={{ marginTop: 8, color: BRAND_BLUE }}>
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
            quiet
          />
        )}
        {/* Card [J]: every card's button read "Részletek"; the label names the grant. Round 2 (Lumen P2-6): the
            visible word comes first, so voice control finds the button by what it shows. */}
        {/* Round 6 (Lumen P2-1): the main action of a fresh card is filled; a stale card (an older search) keeps the
            outline, so the fresh results lead. */}
        <Button
          mode={stale ? 'outlined' : 'contained'}
          onPress={onPress}
          accessibilityLabel={`Részletek: ${item.grants?.title || 'Ismeretlen pályázat'}`}
          style={styles.details}
          contentStyle={styles.detailsContent}
          testID="match-card-details"
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
  // The kind label and the "Új" label in one row; the same place the kind label had alone.
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
    marginLeft: 16,
  },
  // White on NEW_BADGE_BG: at least 4.5:1 (MatchCard test). The stale card no longer fades, so no opacity to count in.
  newBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: NEW_BADGE_BG,
  },
  newBadgeText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
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
  // No opacity (it faded the text under AA); a cool grey and a thin outline mark the older result.
  staleCard: {
    backgroundColor: STALE_CARD_BG,
    borderWidth: 1,
    borderColor: '#C3C7CE',
  },
  // Round 2 (Lumen P2-7): #9E9E9E was 2.67:1. #424242 on STALE_CARD_BG is 9.28:1.
  staleSubtitle: {
    color: '#424242',
  },
  deadline: {
    marginBottom: 8,
  },
  actions: {
    flexWrap: 'wrap',
    rowGap: 8,
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
  // 44 px tall target (round 6, P2-1).
  detailsContent: {
    minHeight: 44,
  },
});

// Contrast on the white card: #B71C1C 6.57:1, #A15C00 5.19:1 (amber, apart from the red), #424242 10.4:1, #616161 6.19:1.
const deadlineStyles = StyleSheet.create({
  expired: { color: '#B71C1C', fontWeight: 'bold' },
  soon: { color: '#A15C00', fontWeight: 'bold' },
  normal: { color: '#424242' },
  unknown: { color: '#616161', fontWeight: 'normal' },
});
