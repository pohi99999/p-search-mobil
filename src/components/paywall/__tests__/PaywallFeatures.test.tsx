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

  it('contains all feature items with correct titles', () => {
    let component: any;
    act(() => {
      component = renderer.create(<PaywallFeatures />);
    });

    const root = component.root;

    const items = root.findAllByProps({ 'data-testID': 'list-item' });
    const validItems = items.filter((item: any) => typeof item.type === 'string');

    expect(validItems.length).toBe(4);

    const titles = validItems.map((item: any) => item.props.title);
    expect(titles).toContain('✍️ Korlátlan AI Pályázatíró & Hitelügyintéző');
    expect(titles).toContain('📂 Automatikus Master Dokumentum Bázis (OCR)');
    expect(titles).toContain('📄 Teljes PDF & DOCX Export');
    expect(titles).toContain('🚫 Hirdetésmentesség');
  });
});
