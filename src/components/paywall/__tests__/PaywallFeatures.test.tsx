import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PaywallFeatures } from '../PaywallFeatures';

jest.mock('react-native-paper', () => {
  const React = require('react');

  const MockCard = (props: any) => {
    return React.createElement('View', props, props.children);
  }

  const MockCardContent = (props: any) => {
    return React.createElement('View', props, props.children);
  }

  MockCard.Content = MockCardContent;

  const List = {
    Item: (props: any) => React.createElement('View', { "data-testID": "list-item", ...props }, props.children)
  };

  return { Card: MockCard, List };
});

describe('PaywallFeatures', () => {
  it('renders correctly', () => {
    let component: any;
    act(() => {
      component = renderer.create(<PaywallFeatures />);
    });
    const tree = component.toJSON();
    expect(tree).toMatchSnapshot();
  });

  // Card bc8e4135: the Paywall may only promise what vc 11+ really does (Play policy). The loan
  // agent, the DOCX export and the OCR document base were promised but not (or not Pro-only) there.
  it('promises only the owner-approved Pro features', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<PaywallFeatures />);
    });
    const items = component!.root.findAll((n) => n.props['data-testID'] === 'list-item' && typeof n.props.title === 'string');
    const titles = items.map((n) => n.props.title as string);
    expect(titles).toEqual([
      '✍️ Copilot akcióterv és pályázati dokumentum',
      '🔎 Korlátlan AI keresés',
      '🚫 Hirdetésmentesség',
    ]);
    const text = items.map((n) => `${n.props.title} ${n.props.description}`).join(' ');
    expect(text).not.toMatch(/DOCX|Hitel|OCR/);
  });

  // Card a96dd8e2 #4 (common test 2026-10-07): the Copilot description was cut at "...a kiv..." on the phone
  // (3 lines). No description may be capped that tight.
  it('does not cut the feature descriptions at 3 lines', () => {
    let component: renderer.ReactTestRenderer;
    act(() => {
      component = renderer.create(<PaywallFeatures />);
    });
    const items = component!.root.findAll((n) => n.props['data-testID'] === 'list-item' && typeof n.props.title === 'string');
    for (const n of items) {
      const lines = n.props.descriptionNumberOfLines;
      expect(lines === undefined ? 2 : lines === 0 ? Infinity : lines).toBeGreaterThanOrEqual(6);
    }
  });
});
