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
    const amountText = 'Összeg: 1\u00A0000\u00A0000 Ft - 5\u00A0000\u00A0000 Ft';
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
        let childrenStr = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children);
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
        return childrenStr === 'Összeg: 500 000 Ft - ? Ft';
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
        return childrenStr === 'Összeg: 0 Ft - 2 000 000 Ft';
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

    const buttonInstance = root!.root.findByProps({ children: 'Részletek' });
    // In react-native-paper, Button wraps content. We need to find the Touchable or Button itself
    // Or we can just find any component with onPress that has 'Részletek' as child.

    const touchables = root!.root.findAll(
      (node) => typeof node.props.onPress === 'function'
    );

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
