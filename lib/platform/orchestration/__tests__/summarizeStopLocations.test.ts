import {
  locationLabelFromStop,
  summarizeStopsByType,
} from '../summarizeStopLocations';

describe('locationLabelFromStop', () => {
  it('prefers city and state over the planner label', () => {
    expect(
      locationLabelFromStop({
        type: 'pickup',
        label: 'Pickup A',
        address: { line1: 'Muthu street', city: 'Chennai', state: 'Tamil Nadu' },
      }),
    ).toBe('Chennai, Tamil Nadu');
  });

  it('falls back to street when city is missing', () => {
    expect(
      locationLabelFromStop({
        type: 'drop',
        label: 'Drop C',
        address: { line1: 'Ramaraj street', city: '', state: '' },
      }),
    ).toBe('Ramaraj street');
  });
});

describe('summarizeStopsByType', () => {
  const stops = [
    {
      type: 'pickup' as const,
      label: 'Pickup A',
      address: { line1: 'Muthu street', city: 'Chennai', state: 'Tamil Nadu' },
    },
    {
      type: 'drop' as const,
      label: 'Drop C',
      address: { line1: 'Ramaraj street', city: '', state: '' },
    },
    {
      type: 'drop' as const,
      label: 'Drop D',
      address: { line1: 'Mukunt drear', city: 'Banglore', state: 'Karnataka' },
    },
  ];

  it('summarizes a single pickup as the location, not Pickup A', () => {
    expect(summarizeStopsByType(stops, 'pickup')).toBe('Chennai, Tamil Nadu');
  });

  it('summarizes multiple drops with locations inside the count label', () => {
    expect(summarizeStopsByType(stops, 'drop')).toBe(
      'Ramaraj street · Banglore, Karnataka',
    );
  });
});
