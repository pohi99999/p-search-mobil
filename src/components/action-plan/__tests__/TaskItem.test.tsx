import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TaskItem } from '../TaskItem';
import type { ActionTask } from '../../../types/database';

jest.mock('react-native-paper', () => {
  const React = require('react');
  const mk = (name: string) => { const C = (p: any) => React.createElement(name, p, p.children); C.displayName = name; return C; };
  return { List: { Item: mk('List.Item') }, Checkbox: mk('Checkbox'), Button: mk('Button'), Text: mk('Text') };
});

// Card a96dd8e2 #11 (common test 2026-10-07): the task titles showed on one line ("Részletes Pályáz...").
// Since PR #205 the descriptions are the step's real sub-points, so they may run longer too.
const TASK = { id: 't1', plan_id: 'p1', title: 'Részletes Pályázati Felhívás Elemzése és jogosultsági ellenőrzés', description: 'Haladéktalanul tanulmányozza át a hivatalos felhívást.', status: 'todo', order_index: 1 } as unknown as ActionTask;

it('shows the task title on more than one line, and room for the real description', () => {
  let root!: renderer.ReactTestRenderer;
  act(() => { root = renderer.create(<TaskItem task={TASK} onStatusChange={jest.fn()} />); });
  const item = root.root.find((n) => (n.type as unknown) === 'List.Item');
  const title = renderTitle(item);
  expect(title.props.children).toBe(TASK.title);
  expect(title.props.numberOfLines ?? 1).toBeGreaterThanOrEqual(2);
  expect(item.props.descriptionNumberOfLines ?? 2).toBeGreaterThanOrEqual(4);
});

// List.Item calls a function title with these props; the mock does not, so the test does.
function renderTitle(item: renderer.ReactTestInstance) {
  expect(typeof item.props.title).toBe('function');
  return item.props.title({ selectable: false, ellipsizeMode: undefined, color: '#000', fontSize: 16 });
}

// Card 83c9d624: "Megfelelőség-viz|sgálat" - on Android the title broke in the middle of a word.
it('the title wraps at word boundaries on Android, not mid-word', () => {
  const long = { ...TASK, title: 'Megfelelőség-vizsgálat és jogosultsági önellenőrzés' } as ActionTask;
  let root!: renderer.ReactTestRenderer;
  act(() => { root = renderer.create(<TaskItem task={long} onStatusChange={jest.fn()} />); });
  const title = renderTitle(root.root.find((n) => (n.type as unknown) === 'List.Item'));
  expect(title.props.textBreakStrategy).toBe('simple');
  expect(title.props.android_hyphenationFrequency).toBe('none');
  // Not cut to one line, and the status button is not in the right slot squeezing the title column.
  expect(title.props.numberOfLines).not.toBe(1);
  expect(root.root.find((n) => (n.type as unknown) === 'List.Item').props.right).toBeUndefined();
});

// Round 2 (Lumen P2-7): a done task's title was #9E9E9E, 2.67:1 on white.
it('a done task title is still readable: at least 4.5:1 on white', () => {
  const { contrastRatio } = require('../../../test-utils/contrast');
  const done = { ...TASK, status: 'done' } as ActionTask;
  let root!: renderer.ReactTestRenderer;
  act(() => { root = renderer.create(<TaskItem task={done} onStatusChange={jest.fn()} />); });
  const title = renderTitle(root.root.find((n) => (n.type as unknown) === 'List.Item'));
  const style = [title.props.style].flat(3).reduce((a: any, s: any) => ({ ...a, ...(s || {}) }), {});
  expect(style.textDecorationLine).toBe('line-through');
  expect(contrastRatio(style.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
});
