import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MatchCard } from '../MatchCard';
import { MatchWithGrant } from '../../hooks/useHomeData';

describe('MatchCard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseMatch: MatchWithGrant = {
    id: '1',
    business_id: 'b1',
    grant_id: 'g1',
    match_score: 85,
    match_reasoning: 'Detailed reasoning for the match',
    status: 'active',
    created_at: '2023-01-01',
    grants: {
      id: 'g1',
      title: 'Test Grant',
      description: 'Grant description',
      provider: 'Test Provider',
      grant_type: 'Test',
      amount_min: 1000000,
      amount_max: 5000000,
      deadline: '2023-12-31',
      eligibility_criteria: 'Criteria',
      source_url: 'http://test.com',
      created_at: '2023-01-01'
    }
  };

  it('renders correctly with full grant data', () => {
    const onPressMock = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<MatchCard item={baseMatch} onPress={onPressMock} />);
    });

    // Test title
    const titleInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Test Grant'
    );
    expect(titleInstances.length).toBeGreaterThan(0);

    // Test match score
    const scoreInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Egyezés: 85%'
    );
    expect(scoreInstances.length).toBeGreaterThan(0);

    // Test provider
    const providerInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Test Provider'
    );
    expect(providerInstances.length).toBeGreaterThan(0);

    // Test match reasoning
    const reasoningInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Detailed reasoning for the match'
    );
    expect(reasoningInstances.length).toBeGreaterThan(0);

    // Test amount
    const amountInstances = root!.root.findAll(
      (node) => {
        if (node.type !== 'Text' || !node.props.children) return false;

        // toLocaleString('hu-HU') creates non-breaking spaces (char code 160)
        // Let's check by flattening children to a string, ignoring exact spaces if needed,
        // or just looking for '1 000 000 Ft' with whatever spaces it produced.
        // It's safer to just check if it contains 'Ft' and the numbers.

        let childrenStr = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
        // Normalize spaces
        childrenStr = childrenStr.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ');
        return childrenStr === 'Összeg: 1 000 000 Ft - 5 000 000 Ft';
      }
    );
    expect(amountInstances.length).toBeGreaterThan(0);
  });

  it('renders correctly with missing optional fields', () => {
    const onPressMock = jest.fn();

    const missingDataMatch: MatchWithGrant = {
      ...baseMatch,
      match_reasoning: null,
      grants: {
        ...baseMatch.grants,
        title: '',
        amount_min: null,
        amount_max: null,
      } as any // as any to bypass strict type check for title='' if needed, but in our case it's string so it's fine. Wait, let's remove grants entirely if possible?
    };

    // Alternatively, let's just make missingDataMatch lack title and amounts.
    missingDataMatch.grants = {
      ...baseMatch.grants,
      title: '',
      description: 'Fallback description',
      amount_min: null,
      amount_max: null,
    };

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<MatchCard item={missingDataMatch} onPress={onPressMock} />);
    });

    // Test fallback title
    const titleInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Ismeretlen pályázat'
    );
    expect(titleInstances.length).toBeGreaterThan(0);

    // Test fallback description
    const descInstances = root!.root.findAll(
      (node) => node.type === 'Text' && node.props.children === 'Fallback description'
    );
    expect(descInstances.length).toBeGreaterThan(0);

    // Verify amount is not rendered
    const amountInstances = root!.root.findAll(
      (node) => {
        if (node.type !== 'Text' || !node.props.children) return false;
        const childrenStr = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
        return childrenStr.includes('Összeg:');
      }
    );
    expect(amountInstances.length).toBe(0);
  });

  it('renders amount correctly when only amount_min is present', () => {
    const onPressMock = jest.fn();

    const match: MatchWithGrant = {
      ...baseMatch,
      grants: {
        ...baseMatch.grants,
        amount_min: 500000,
        amount_max: null,
      }
    };

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<MatchCard item={match} onPress={onPressMock} />);
    });

    const amountInstances = root!.root.findAll(
      (node) => {
        if (node.type !== 'Text' || !node.props.children) return false;
        let childrenStr = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
        childrenStr = childrenStr.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ');
        return childrenStr === 'Összeg: legalább 500 000 Ft';
      }
    );
    expect(amountInstances.length).toBeGreaterThan(0);
  });

  it('renders amount correctly when only amount_max is present', () => {
    const onPressMock = jest.fn();

    const match: MatchWithGrant = {
      ...baseMatch,
      grants: {
        ...baseMatch.grants,
        amount_min: null,
        amount_max: 2000000,
      }
    };

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<MatchCard item={match} onPress={onPressMock} />);
    });

    const amountInstances = root!.root.findAll(
      (node) => {
        if (node.type !== 'Text' || !node.props.children) return false;
        let childrenStr = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
        childrenStr = childrenStr.replace(/\s+/g, ' ').replace(/\u00A0/g, ' ');
        return childrenStr === 'Összeg: legfeljebb 2 000 000 Ft';
      }
    );
    expect(amountInstances.length).toBeGreaterThan(0);
  });

  it('calls onPress when the button is pressed', () => {
    const onPressMock = jest.fn();

    let root: renderer.ReactTestRenderer | undefined;
    act(() => {
      root = renderer.create(<MatchCard item={baseMatch} onPress={onPressMock} />);
    });

    // To safely trigger, we can just find the button that is supposed to be pressed
    // react-native-paper Button forwards onPress to TouchableRipple or similar.
    // Let's just find the node by text "Részletek" and traverse up to find onPress, or just use findByType.

    const btn = root!.root.find((node) => {
        return node.type === require('react-native-paper').Button || node.props.testID === 'details-button';
    });

    act(() => {
      btn.props.onPress();
    });

    expect(onPressMock).toHaveBeenCalledTimes(1);
  });
});

// Card 378073ce: the owner's cards said "1 Ft - 138 937 500 000 Ft" (a placeholder minimum and the
// programme budget as a maximum). The card now says what the data supports.
it('does not invent a range from a 1 Ft placeholder and a programme budget', async () => {
  const item = { id: 'm', business_id: 'b', grant_id: 'g', match_score: 70, match_reasoning: '', status: 'new', created_at: '', grants: { id: 'g', title: 'Kombinált keret', provider: 'GINOP Plusz', description: '', amount_min: 1, amount_max: 138937500000 } } as any;
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<MatchCard item={item} onPress={() => {}} />); });
  const json = JSON.stringify(tree!.toJSON());
  // The Text renders ["Összeg: ", "<amount line>"] as two children, so match the amount line itself.
  expect(json).toContain('keretösszeg 138 937 500 000 Ft');
  expect(json).not.toContain('1 Ft');
});

// Card 2428c38f: a match the latest scan did not re-score is labelled, not shown as fresh.
it('labels a stale match as a result of an earlier search', async () => {
  const item = { id: 'm1', business_id: 'b', grant_id: 'g', match_score: 50, match_reasoning: 'régi indoklás', status: 'stale', created_at: '', grants: { id: 'g', title: 'Régi pályázat', provider: 'X', description: '', amount_min: null, amount_max: null } } as any;
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<MatchCard item={item} onPress={() => {}} />); });
  const json = JSON.stringify(tree!.toJSON());
  expect(json).toContain('Korábbi keresés találata');
  expect(json).not.toContain('Egyezés: 50%');
});

// Card [A]: the deadline is on the card, expired ones in red.
describe('deadline line (card [A])', () => {
  const withDeadline = (deadline: string | null) => ({ id: 'm2', business_id: 'b', grant_id: 'g', match_score: 60, match_reasoning: '', status: 'new', created_at: '', grants: { id: 'g', title: 'Határidős pályázat', provider: 'X', description: '', amount_min: null, amount_max: null, deadline } } as any);
  const deadlineText = async (deadline: string | null) => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<MatchCard item={withDeadline(deadline)} onPress={() => {}} />); });
    const node = tree!.root.findAll((n) => n.props.testID === 'match-deadline' && typeof n.props.children === 'string')[0];
    return { text: node.props.children as string, style: JSON.stringify(node.props.style) };
  };

  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 25, 10, 0, 0)); });
  afterEach(() => { jest.useRealTimers(); });

  it('shows the days left for an open grant', async () => {
    const { text } = await deadlineText(new Date(2026, 11, 30, 12).toISOString());
    expect(text).toBe('Beadás: 2026. 12. 30. (még 66 nap)');
  });

  it('marks an expired grant in red', async () => {
    const { text, style } = await deadlineText(new Date(2026, 9, 1, 12).toISOString());
    expect(text).toBe('Lejárt: 2026. 10. 01.');
    expect(style).toContain('#B71C1C');
  });

  it('says when there is no deadline', async () => {
    const { text } = await deadlineText(null);
    expect(text).toBe('Beadási határidő: nincs megadva');
  });
});

// Round 2 (Lumen P2-6, P2-7).
describe('round 2: the details button name and the stale subtitle contrast', () => {
  const { contrastRatio, textColor } = require('../../test-utils/contrast');
  const { StyleSheet } = require('react-native');

  it('the details button name starts with the word it shows, then names the grant', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<MatchCard item={{ id: 'm', business_id: 'b', grant_id: 'g', match_score: 70, match_reasoning: '', status: 'new', created_at: '', grants: { id: 'g', title: 'GINOP Plusz', provider: 'X', description: '', amount_min: null, amount_max: null } } as any} onPress={() => {}} />); });
    const labels = tree!.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && /GINOP Plusz/.test(n.props.accessibilityLabel)).map((n) => n.props.accessibilityLabel);
    expect(labels).toContain('Részletek: GINOP Plusz');
  });

  it('the stale subtitle stays at least 4.5:1 on white, with the card opacity counted in', async () => {
    const item = { id: 'm1', business_id: 'b', grant_id: 'g', match_score: 50, match_reasoning: '', status: 'stale', created_at: '', grants: { id: 'g', title: 'Régi pályázat', provider: 'X', description: '', amount_min: null, amount_max: null } } as any;
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<MatchCard item={item} onPress={() => {}} />); });
    const node = tree!.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string' && n.props.children.startsWith('Korábbi keresés találata'))[0];
    let opacity = 1;
    // host elements only: a composite passes the same style down, and would count it more than once
    for (let p: any = node; p; p = p.parent) {
      if (typeof p.type !== 'string') continue;
      const o = StyleSheet.flatten(p.props?.style)?.opacity;
      if (typeof o === 'number') opacity *= o;
    }
    const fg = textColor(node.props.style);
    // the colour as it lands on the white card under the opacity
    const ch = (i: number) => Math.round(parseInt(fg.slice(1 + i * 2, 3 + i * 2), 16) * opacity + 255 * (1 - opacity));
    const blended = '#' + [0, 1, 2].map((i) => ch(i).toString(16).padStart(2, '0')).join('');
    expect(opacity).toBeLessThan(1);
    expect(contrastRatio(blended, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});
