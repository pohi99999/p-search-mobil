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
