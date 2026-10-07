import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { TaskItem } from '../TaskItem';
import type { ActionTask } from '../../../types/database';

jest.mock('react-native-paper', () => {
  const React = require('react');
  const mk = (name: string) => { const C = (p: any) => React.createElement(name, p, p.children); C.displayName = name; return C; };
  return { List: { Item: mk('List.Item') }, Checkbox: mk('Checkbox'), Button: mk('Button') };
});

// Card a96dd8e2 #11 (common test 2026-10-07): the task titles showed on one line ("Részletes Pályáz...").
// Since PR #205 the descriptions are the step's real sub-points, so they may run longer too.
const TASK = { id: 't1', plan_id: 'p1', title: 'Részletes Pályázati Felhívás Elemzése és jogosultsági ellenőrzés', description: 'Haladéktalanul tanulmányozza át a hivatalos felhívást.', status: 'todo', order_index: 1 } as unknown as ActionTask;

it('shows the task title on more than one line, and room for the real description', () => {
  let root!: renderer.ReactTestRenderer;
  act(() => { root = renderer.create(<TaskItem task={TASK} onStatusChange={jest.fn()} />); });
  const item = root.root.find((n) => (n.type as unknown) === 'List.Item');
  expect(item.props.title).toBe(TASK.title);
  expect(item.props.titleNumberOfLines ?? 1).toBeGreaterThanOrEqual(2);
  expect(item.props.descriptionNumberOfLines ?? 2).toBeGreaterThanOrEqual(4);
});
