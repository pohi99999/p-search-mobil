import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HomeEmptyState, type HomeEmptyStateKind } from './HomeEmptyState';

// Handle React Native Paper component interactions that require timers (like Surface, ActivityIndicator)
beforeAll(() => {
  jest.useFakeTimers();
});

afterAll(() => {
  jest.useRealTimers();
});

// Card [D]: three states instead of a spinner that ran forever.
describe('HomeEmptyState', () => {
  const render = async (kind: HomeEmptyStateKind, profileIncomplete = false) => {
    const onSearch = jest.fn();
    const onEditProfile = jest.fn();
    let root: renderer.ReactTestRenderer;
    await act(async () => {
      root = renderer.create(
        <HomeEmptyState kind={kind} profileIncomplete={profileIncomplete} onSearch={onSearch} onEditProfile={onEditProfile} />,
      );
    });
    const text = JSON.stringify(root!.toJSON());
    const press = async (testID: string) => {
      const btn = root!.root.findAll((n) => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
      await act(async () => { btn.props.onPress(); });
    };
    const has = (testID: string) => root!.root.findAll((n) => n.props.testID === testID).length > 0;
    const spinners = root!.root.findAll((n) => (n.type as unknown) === 'ActivityIndicator').length;
    return { text, press, has, spinners, onSearch, onEditProfile };
  };

  it('a running search shows the spinner and no button', async () => {
    const r = await render('searching');
    expect(r.text).toContain('Keressük a cégedhez illő pályázatokat');
    expect(r.spinners).toBeGreaterThan(0);
    expect(r.has('empty-search')).toBe(false);
  });

  it('never searched: no spinner, a button that starts the search', async () => {
    const r = await render('never');
    expect(r.text).toContain('Még nem kerestünk a cégednek');
    expect(r.text).not.toContain('Keresés folyamatban');
    expect(r.spinners).toBe(0);
    await r.press('empty-search');
    expect(r.onSearch).toHaveBeenCalledTimes(1);
    expect(r.has('empty-edit-profile')).toBe(false);
  });

  it('never searched with an incomplete profile also offers to complete it', async () => {
    const r = await render('never', true);
    expect(r.text).toContain('Minél több adatot adsz meg a cégedről');
    await r.press('empty-edit-profile');
    expect(r.onEditProfile).toHaveBeenCalledTimes(1);
  });

  it('0 matches: no spinner, no notification promise, profile and retry buttons', async () => {
    const r = await render('none');
    expect(r.text).toContain('Most nincs a cégedhez illő nyitott pályázat');
    expect(r.text).not.toContain('értesítünk');
    expect(r.spinners).toBe(0);
    await r.press('empty-edit-profile');
    expect(r.onEditProfile).toHaveBeenCalledTimes(1);
    await r.press('empty-search');
    expect(r.onSearch).toHaveBeenCalledTimes(1);
  });
});
