import { aggregateOrbitMap, type OrbitMapRow } from './orbit-map';
import { findIndianCity } from './india-cities';

const campus = (name: string, city: string | null): OrbitMapRow => ({ collegeName: name, space: { name, city } });

describe('aggregateOrbitMap', () => {
  it('names colleges with 3+ applications and folds the rest into Other colleges', () => {
    const rows = [
      ...Array(4).fill(campus('Malla Reddy University', 'Medchal, Hyderabad')),
      campus('CBIT', 'Hyderabad'),
      campus('Osmania University', 'Secunderabad'),
      campus('RVCE', 'Bangalore'),
    ];
    const map = aggregateOrbitMap(rows);
    const hyd = map.cities.find((c) => c.city === 'Hyderabad')!;
    expect(hyd.colleges).toEqual([
      { name: 'Malla Reddy University', count: 4 },
      { name: 'Other colleges', count: 2 },
    ]);
    // A lone applicant is never named.
    expect(JSON.stringify(map)).not.toContain('RVCE');
    expect(map.cities.find((c) => c.city === 'Bengaluru')!.colleges).toEqual([{ name: 'Other colleges', count: 1 }]);
    expect(map.totals).toEqual({ applications: 7, cities: 2, colleges: 4 });
  });

  it('counts unplaced applications in the totals only', () => {
    const map = aggregateOrbitMap([
      { collegeName: 'Some College, Nowhere', space: null },
      campus('Unknown Campus', 'Atlantis'),
    ]);
    expect(map.cities).toEqual([]);
    expect(map.totals).toEqual({ applications: 2, cities: 0, colleges: 2 });
  });
});

describe('findIndianCity', () => {
  it('matches names, aliases and comma-separated parts', () => {
    expect(findIndianCity('Bangalore')?.city).toBe('Bengaluru');
    expect(findIndianCity('Maisammaguda, Medchal')?.city).toBe('Hyderabad');
    expect(findIndianCity('vizag')?.city).toBe('Visakhapatnam');
    expect(findIndianCity('Atlantis')).toBeNull();
    expect(findIndianCity(null)).toBeNull();
  });
});
