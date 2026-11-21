import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HomeStatusHeader } from '../HomeStatusHeader';
import { contrastRatio, textColor } from '../../test-utils/contrast';

const texts = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children as string);

const render = (props: React.ComponentProps<typeof HomeStatusHeader>) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<HomeStatusHeader {...props} />);
  });
  return tree!;
};

describe('HomeStatusHeader (round 11-21 #2, #4)', () => {
  const freshness = { updatedAt: '2026-11-21T09:07:00Z', openCount: 52 };
  const day = new Date(freshness.updatedAt).toLocaleDateString('hu-HU');

  it('both lines', () => {
    const tree = render({ newCount: 3, freshness });
    expect(texts(tree)).toEqual(
      expect.arrayContaining(['3 új pályázat a legutóbbi látogatásod óta', `Pályázatlista frissítve: ${day} · 52 nyitott pályázat`]),
    );
  });

  it('no new matches: only the freshness line', () => {
    const tree = render({ newCount: 0, freshness });
    expect(tree.root.findAll((n) => n.props.testID === 'home-status-new')).toHaveLength(0);
    expect(tree.root.findAll((n) => n.props.testID === 'home-status-freshness').length).toBeGreaterThan(0);
  });

  it('no freshness (a failed read): no guess on the screen', () => {
    const tree = render({ newCount: 2, freshness: null });
    expect(tree.root.findAll((n) => n.props.testID === 'home-status-freshness')).toHaveLength(0);
    expect(texts(tree).join(' ')).not.toMatch(/frissítve/);
  });

  it('nothing to say: renders nothing', () => {
    const tree = render({ newCount: 0, freshness: null });
    expect(tree.toJSON()).toBeNull();
  });

  it('the text colours stay at least 4.5:1 on their backgrounds', () => {
    const tree = render({ newCount: 1, freshness });
    const newText = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === '1 új pályázat a legutóbbi látogatásod óta')[0];
    const freshText = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string' && n.props.children.startsWith('Pályázatlista'))[0];
    expect(contrastRatio(textColor(newText.props.style), '#E3F2FD')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(textColor(freshText.props.style), '#F5F5F5')).toBeGreaterThanOrEqual(4.5);
  });
});
