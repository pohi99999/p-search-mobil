import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useProfileGate, __resetProfileGateForTests } from '../useProfileGate';
import type { BusinessProfile } from '../../types/database';

// Card 431a496e: before a plan or a PDF is generated, an empty profile is asked for its key fields
// (skippable); a filled profile goes straight on.
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(() => ({ update: (u: unknown) => { mockUpdate(u); return { eq: (...a: unknown[]) => { mockEq(...a); return Promise.resolve({ error: null }); } }; } })) },
}));
jest.mock('../../context/ProfileContext', () => ({ useProfile: () => ({ refreshProfile: mockRefresh }) }));
jest.mock('react-native-paper', () => {
  const React = require('react');
  const mk = (name: string) => { const C = (p: any) => React.createElement(name, p, p.children); C.displayName = name; return C; };
  return { Button: mk('Button'), HelperText: mk('HelperText'), Surface: mk('Surface'), Text: mk('Text'), TextInput: mk('TextInput') };
});

const EMPTY = { id: 'p1', company_name: 'Minta Kft', industry_code: '', employee_count: null, yearly_revenue: null, goals: '' } as unknown as BusinessProfile;
const FULL = { ...EMPTY, id: 'p2', industry_code: '62.01', employee_count: 8, yearly_revenue: 50000000, goals: 'Digitalizáció' } as unknown as BusinessProfile;

let api: ReturnType<typeof useProfileGate>;
function Probe({ profile, onApi }: { profile: BusinessProfile; onApi: (g: ReturnType<typeof useProfileGate>) => void }) {
  const gate = useProfileGate(profile);
  onApi(gate);
  return <>{gate.dialog}</>;
}
const probe = (profile: BusinessProfile) => <Probe profile={profile} onApi={(g) => { api = g; }} />;
const byTestId = (root: renderer.ReactTestRenderer, id: string) => root.root.find((n) => n.props.testID === id && typeof n.type === 'string');

beforeEach(() => { jest.clearAllMocks(); __resetProfileGateForTests(); });

it('a filled profile: the action runs at once, no dialog', async () => {
  const action = jest.fn();
  let root!: renderer.ReactTestRenderer;
  await act(async () => { root = renderer.create(probe(FULL)); });
  await act(async () => { api.gate(action); });
  expect(action).toHaveBeenCalledTimes(1);
  expect(root.root.findAll((n) => n.props.testID === 'profile-save')).toHaveLength(0);
});

it("Péter's empty profile: the dialog asks for the four fields first, the action waits", async () => {
  const action = jest.fn();
  let root!: renderer.ReactTestRenderer;
  await act(async () => { root = renderer.create(probe(EMPTY)); });
  await act(async () => { api.gate(action); });
  expect(action).not.toHaveBeenCalled();
  for (const k of ['industry_code', 'yearly_revenue', 'employee_count', 'goals']) expect(byTestId(root, `profile-field-${k}`)).toBeTruthy();
});

it('"Mentés és tovább": the filled fields are saved on this profile, refreshed, then the action runs', async () => {
  const action = jest.fn();
  let root!: renderer.ReactTestRenderer;
  await act(async () => { root = renderer.create(probe(EMPTY)); });
  await act(async () => { api.gate(action); });
  await act(async () => { byTestId(root, 'profile-field-industry_code').props.onChangeText('62.01'); byTestId(root, 'profile-field-yearly_revenue').props.onChangeText('50 000 000'); });
  await act(async () => { await byTestId(root, 'profile-save').props.onPress(); });
  expect(mockUpdate).toHaveBeenCalledWith({ industry_code: '62.01', yearly_revenue: 50000000 });
  expect(mockEq).toHaveBeenCalledWith('id', 'p1');
  expect(mockRefresh).toHaveBeenCalled();
  expect(action).toHaveBeenCalledTimes(1);
});

it('"Kihagyom": the action runs without saving, and the same session does not ask again', async () => {
  const action = jest.fn();
  let root!: renderer.ReactTestRenderer;
  await act(async () => { root = renderer.create(probe(EMPTY)); });
  await act(async () => { api.gate(action); });
  await act(async () => { byTestId(root, 'profile-skip').props.onPress(); });
  expect(action).toHaveBeenCalledTimes(1);
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(async () => { api.gate(action); });
  expect(action).toHaveBeenCalledTimes(2);
});

it('a non-number for the revenue: an error, nothing saved, the action waits', async () => {
  const action = jest.fn();
  let root!: renderer.ReactTestRenderer;
  await act(async () => { root = renderer.create(probe(EMPTY)); });
  await act(async () => { api.gate(action); });
  await act(async () => { byTestId(root, 'profile-field-yearly_revenue').props.onChangeText('sok'); });
  await act(async () => { await byTestId(root, 'profile-save').props.onPress(); });
  expect(mockUpdate).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});
