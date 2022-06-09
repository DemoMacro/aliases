# @aliases/zxcvbn

![npm version](https://img.shields.io/npm/v/@aliases/zxcvbn)
![npm downloads](https://img.shields.io/npm/dw/@aliases/zxcvbn)
![npm license](https://img.shields.io/npm/l/@aliases/zxcvbn)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](https://www.contributor-covenant.org/version/2/1/code_of_conduct/)

> Low-budget password strength estimates, powered by Demo Macro.

This package is the typescript version of [zxcvbn](https://github.com/dropbox/zxcvbn), which performs slightly better than the original version and is fully compatible with it.

## Getting started

```bash
# npm
$ npm install @aliases/zxcvbn

# yarn
$ yarn add @aliases/zxcvbn

# pnpm
$ pnpm add @aliases/zxcvbn
```

## Usage

```ts
import zxcvbn from "@aliases/zxcvbn";

console.log(zxcvbn("abc123"));
```

```bash
$ vite-node zxcvbn.ts
{
  password: 'abc123',
  guesses: 14,
  guesses_log10: 1.1461280356782377,
  sequence: [
    {
      pattern: 'dictionary',
      i: 0,
      j: 5,
      token: 'abc123',
      matched_word: 'abc123',
      rank: 13,
      dictionary_name: 'passwords',
      reversed: false,
      l33t: false,
      base_guesses: 13,
      uppercase_variations: 1,
      l33t_variations: 1,
      guesses: 13,
      guesses_log10: 1.1139433523068367
    }
  ],
  calc_time: 4,
  crack_times_seconds: {
    online_throttling_100_per_hour: 504,
    online_no_throttling_10_per_second: 1.4,
    offline_slow_hashing_1e4_per_second: 0.0014,
    offline_fast_hashing_1e10_per_second: 1.4e-9
  },
  crack_times_display: {
    online_throttling_100_per_hour: '8 minutes',
    online_no_throttling_10_per_second: '1 second',
    offline_slow_hashing_1e4_per_second: 'less than a second',
    offline_fast_hashing_1e10_per_second: 'less than a second'
  },
  score: 0,
  feedback: {
    warning: 'This is a top-100 common password',
    suggestions: [ 'Add another word or two. Uncommon words are better.' ]
  }
}
```

## Credits

- [Demo Macro](https://github.com/DemoMacro) - Always believe that good things are about to happen.

## License

- Code - [MIT](LICENSE) &copy; [Demo Macro](https://imst.xyz/)
- Documentation - [CC-BY-NC-SA-4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) &copy; [Demo Macro](https://imst.xyz/)
