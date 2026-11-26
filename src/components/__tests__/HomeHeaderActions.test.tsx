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

  // Round 6 follow-up (Ellenőr 9290): mutants that cut the label to one line, faded its colour or put the 0.5 letter
  // spacing back stayed green. Measured in the browser: at 320 px one line cut "Dokumentum feltöltése", and the 0.5
  // spacing broke "Dokumentumok" inside the word; #424242 on white is 10.05:1.
  it('the label may take two lines, is centred, keeps the tight spacing, and is AA on white', () => {
    const { contrastRatio } = require('../../test-utils/contrast');
    const { buttons } = render();
    for (const b of buttons) {
      const label = b.findAll((n: any) => typeof n.props.children === 'string' && n.props.numberOfLines !== undefined)[0];
      expect(label.props.numberOfLines).toBe(2);
      const style = StyleSheet.flatten(label.props.style);
      expect(style.textAlign).toBe('center');
      expect(style.letterSpacing).toBeLessThanOrEqual(0.1);
      expect(contrastRatio(style.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
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
