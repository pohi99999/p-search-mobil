import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { ProgressBar } from 'react-native-paper';
import { ProfileStrength, filledMatchFields } from '../ProfileStrength';

// vc23 (Lumen L8): the onboarding shows how many of the fields the AI search reads are filled.
describe('ProfileStrength', () => {
  it('counts the four fields the matching reads, not the name or the tax number', () => {
    expect(filledMatchFields({})).toBe(0);
    expect(filledMatchFields({ industry_code: '62.01', goals: '  ' })).toBe(1);
    expect(filledMatchFields({ industry_code: '62.01', employee_count: '8', yearly_revenue: '5000000', goals: 'gépbeszerzés' })).toBe(4);
    expect(filledMatchFields({ company_name: 'X Kft.', tax_number: '12345678-2-20' } as never)).toBe(0);
  });

  // Ellenőr #273: the bar counted "0" or "abc" employees, which the save refuses. It counts only what the save takes.
  it.each([['0'], ['abc'], ['-5'], ['1,5']])('a value the save refuses (%p employees) is not counted', (employees) => {
    const { profileUpdateFromForm } = require('../../lib/profileCompleteness');
    const form = { industry_code: '62.01', yearly_revenue: '50000000', goals: 'gépbeszerzés', employee_count: employees };
    expect(profileUpdateFromForm(form).ok).toBe(false);
    expect(filledMatchFields(form)).toBe(3);
  });

  it('a value the save accepts is counted, with spaces or dots as thousands separators', () => {
    expect(filledMatchFields({ employee_count: '8', yearly_revenue: '50 000 000' })).toBe(2);
    expect(filledMatchFields({ yearly_revenue: '50.000.000' })).toBe(1);
  });

  it('the bar turns green only when all four are filled, and names its count for a screen reader', () => {
    const { contrastRatio } = require('../../test-utils/contrast');
    let root!: renderer.ReactTestRenderer;
    act(() => { root = renderer.create(<ProfileStrength form={{ industry_code: '62.01' }} />); });
    let bar = root.root.findByType(ProgressBar);
    const partColor = bar.props.color;
    expect(bar.props.accessibilityLabel).toBe('A találatot pontosító adatok: 1 a 4-ből');
    act(() => { root.update(<ProfileStrength form={{ industry_code: '62.01', employee_count: '8', yearly_revenue: '5000000', goals: 'gép' }} />); });
    bar = root.root.findByType(ProgressBar);
    expect(bar.props.color).not.toBe(partColor);
    expect(bar.props.color).toBe('#2E7D32');
    expect(bar.props.accessibilityLabel).toBe('A találatot pontosító adatok: 4 a 4-ből');
    // the bar against the white card: at least 3:1 for a non-text element, in both colours
    expect(contrastRatio(partColor, '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(bar.props.color, '#FFFFFF')).toBeGreaterThanOrEqual(3);
  });

  it('the label is readable on the white card (4.5:1)', () => {
    const { contrastRatio, textColor } = require('../../test-utils/contrast');
    let root!: renderer.ReactTestRenderer;
    act(() => { root = renderer.create(<ProfileStrength form={{}} />); });
    const label = root.root.findAll((n) => typeof n.props.children === 'string' && n.props.children.startsWith('A találatot pontosító adatok') && n.props.style)[0];
    expect(contrastRatio(textColor(label.props.style), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('shows the count and a bar in a fixed-height box', () => {
    let root!: renderer.ReactTestRenderer;
    act(() => { root = renderer.create(<ProfileStrength form={{ industry_code: '62.01', employee_count: '8' }} />); });
    expect(JSON.stringify(root.toJSON())).toContain('A találatot pontosító adatok: 2/4');
    const bar = root.root.findByType(ProgressBar);
    expect(bar.props.progress).toBe(0.5);
    const box = bar.parent!;
    expect(StyleSheet.flatten(box.props.style).height).toBe(6);
  });
});
