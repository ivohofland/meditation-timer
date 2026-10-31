import { chooseEngine, isAppleHandheld } from './engine'

test('stream only where it is needed and known to work: iPhone and iPad', () => {
  expect(chooseEngine({ appleHandheld: true, override: null })).toBe('stream')
  expect(chooseEngine({ appleHandheld: false, override: null })).toBe('webaudio')
})

test('?engine= overrides the choice, and anything else is ignored', () => {
  expect(chooseEngine({ appleHandheld: false, override: 'stream' })).toBe('stream')
  expect(chooseEngine({ appleHandheld: true, override: 'webaudio' })).toBe('webaudio')
  expect(chooseEngine({ appleHandheld: true, override: 'nonsense' })).toBe('stream')
})

test.each([
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15', 5, true],
  ['Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15', 5, true],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15', 5, true],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/19.0 Safari/605.1.15', 0, false],
  ['Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/156.0 Mobile Safari/537.36', 5, false],
])('%s with %d touch points → %s', (ua, touch, expected) => {
  expect(isAppleHandheld(ua, touch)).toBe(expected)
})
