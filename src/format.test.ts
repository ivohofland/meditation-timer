import { formatRemaining } from './format'

test.each([
  [0, '0:00'], [0.2, '0:01'], [59.01, '1:00'], [600, '10:00'], [3599.5, '1:00:00'], [3600, '1:00:00'], [3661, '1:01:01'], [-3, '0:00'],
])('%d s → %s', (s, out) => expect(formatRemaining(s)).toBe(out))
