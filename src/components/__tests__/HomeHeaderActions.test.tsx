// Round 6 (Lumen P1-3): the home header's ways on carry a visible label, a 48 px tall target, and an accessible name
// that contains the visible label (WCAG 2.5.3, label in name).
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { HomeHeaderActions, type HomeHeaderAction } from '../HomeHeaderActions';

const ACTIONS: HomeHeaderAction[] = [
  { icon: 'bookmark-multiple', label: 'Saját pályázataim', accessibilityLabel: 'Saját pályázataim', onPress: jest.fn(), testID: 'home-followed-button' },
  { icon: 'file-document-plus', label: 'Dokumentumok', accessibilityLabel: 'Pénzügyi dokumentumok feltöltése', onPress: jest.fn(), testID: 'home-document-upload-button' },
  { icon: 'cog', label: 'Beállítások', accessibilityLabel: 'Beállítások megnyitása', onPress: jest.fn(), testID: 'home-settings-button' },
];

const text = (n: any): string =>
  typeof n === 'string' ? n : Array.isArray(n) ? n.map(text).join('') : n?.props ? text(n.props.children) : '';

function render() {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<HomeHeaderActions actions={ACTIONS} />);
  });
  // The pressable host of each action: the node that carries the role and the press handler.
  const buttons = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
  return { tree, buttons };
}

describe('HomeHeaderActions', () => {
  it('shows each label as text, in order', () => {
    const { buttons } = render();
    expect(buttons.map((b) => b.props.testID)).toEqual(ACTIONS.map((a) => a.testID));
    expect(buttons.map((b) => text(b.props.children))).toEqual(ACTIONS.map((a) => a.label));
  });

  it('the accessible name contains the visible label (WCAG 2.5.3)', () => {
    const { buttons } = render();
    for (const b of buttons) {
      expect(b.props.accessibilityLabel.toLowerCase()).toContain(text(b.props.children).toLowerCase());
    }
  });

  it('every target is at least 48 px tall and takes an equal share of the row', () => {
    const { buttons } = render();
    for (const b of buttons) {
      const style = StyleSheet.flatten(typeof b.props.style === 'function' ? b.props.style({ pressed: false }) : b.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(48);
      expect(style.flex).toBe(1);
    }
  });

  it('a press runs that action only', () => {
    const { buttons } = render();
    act(() => buttons[1].props.onPress());
    expect(ACTIONS[1].onPress).toHaveBeenCalledTimes(1);
    expect(ACTIONS[0].onPress).not.toHaveBeenCalled();
    expect(ACTIONS[2].onPress).not.toHaveBeenCalled();
  });
});
