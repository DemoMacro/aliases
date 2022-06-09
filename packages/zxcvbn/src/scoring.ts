import adjacency_graphs from "./adjacency_graphs";

// on qwerty, 'g' has degree 6, being adjacent to 'ftyhbv'. '\' has degree 1.
// this calculates the average over all keys.
const calc_average_degree = function (graph) {
  let average = 0;
  for (const key in graph) {
    const neighbors = graph[key];
    average += (function () {
      const results = [];
      for (let o = 0, len = neighbors.length; o < len; o++) {
        const n = neighbors[o];
        if (n) {
          results.push(n);
        }
      }
      return results;
    })().length;
  }
  average /= (function () {
    const results = [];
    for (const k in graph) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const v = graph[k];
      results.push(k);
    }
    return results;
  })().length;
  return average;
};

const BRUTEFORCE_CARDINALITY = 10;

const MIN_GUESSES_BEFORE_GROWING_SEQUENCE = 10000;

const MIN_SUBMATCH_GUESSES_SINGLE_CHAR = 10;

const MIN_SUBMATCH_GUESSES_MULTI_CHAR = 50;

const scoring = {
  nCk: function (n, k) {
    if (k > n) {
      // http://blog.plover.com/math/choose.html
      return 0;
    }
    if (k === 0) {
      return 1;
    }
    let r = 1;
    let d, o, ref;
    for (
      d = o = 1, ref = k;
      1 <= ref ? o <= ref : o >= ref;
      d = 1 <= ref ? ++o : --o
    ) {
      r *= n;
      r /= d;
      n -= 1;
    }
    return r;
  },
  log10: function (n) {
    return Math.log(n) / Math.log(10); // IE doesn't support Math.log10 :(
  },
  log2: function (n) {
    return Math.log(n) / Math.log(2);
  },
  factorial: function (n) {
    if (n < 2) {
      // unoptimized, called only on small n
      return 1;
    }
    let f = 1;
    let i, o, ref;
    for (
      i = o = 2, ref = n;
      2 <= ref ? o <= ref : o >= ref;
      i = 2 <= ref ? ++o : --o
    ) {
      f *= i;
    }
    return f;
  },
  // ------------------------------------------------------------------------------
  // search --- most guessable match sequence -------------------------------------
  // ------------------------------------------------------------------------------

  // takes a sequence of overlapping matches, returns the non-overlapping sequence with
  // minimum guesses. the following is a O(l_max * (n + m)) dynamic programming algorithm
  // for a length-n password with m candidate matches. l_max is the maximum optimal
  // sequence length spanning each prefix of the password. In practice it rarely exceeds 5 and the
  // search terminates rapidly.

  // the optimal "minimum guesses" sequence is here defined to be the sequence that
  // minimizes the following function:

  //    g = l! * Product(m.guesses for m in sequence) + D^(l - 1)

  // where l is the length of the sequence.

  // the factorial term is the number of ways to order l patterns.

  // the D^(l-1) term is another length penalty, roughly capturing the idea that an
  // attacker will try lower-length sequences first before trying length-l sequences.

  // for example, consider a sequence that is date-repeat-dictionary.
  //  - an attacker would need to try other date-repeat-dictionary combinations,
  //    hence the product term.
  //  - an attacker would need to try repeat-date-dictionary, dictionary-repeat-date,
  //    ..., hence the factorial term.
  //  - an attacker would also likely try length-1 (dictionary) and length-2 (dictionary-date)
  //    sequences before length-3. assuming at minimum D guesses per pattern type,
  //    D^(l-1) approximates Sum(D^i for i in [1..l-1]

  // ------------------------------------------------------------------------------
  most_guessable_match_sequence: function (
    password,
    matches,
    _exclude_additive = false
  ) {
    const n = password.length;
    // partition matches into sublists according to ending index j
    const matches_by_j = (function () {
      const results = [];
      let _, ref, o;
      for (
        _ = o = 0, ref = n;
        0 <= ref ? o < ref : o > ref;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _ = 0 <= ref ? ++o : --o
      ) {
        results.push([]);
      }
      return results;
    })();
    for (let o = 0, len = matches.length; o < len; o++) {
      const m = matches[o];
      matches_by_j[m.j].push(m);
    }
    // small detail: for deterministic output, sort each sublist by i.
    for (let q = 0, len1 = matches_by_j.length; q < len1; q++) {
      const lst = matches_by_j[q];
      lst.sort(function (m1, m2) {
        return m1.i - m2.i;
      });
    }
    const optimal = {
      // optimal.m[k][l] holds final match in the best length-l match sequence covering the
      // password prefix up to k, inclusive.
      // if there is no length-l sequence that scores better (fewer guesses) than
      // a shorter match sequence spanning the same prefix, optimal.m[k][l] is undefined.
      m: (function () {
        const results = [];
        let _, u, ref;
        for (
          _ = u = 0, ref = n;
          0 <= ref ? u < ref : u > ref;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _ = 0 <= ref ? ++u : --u
        ) {
          results.push({});
        }
        return results;
      })(),
      // same structure as optimal.m -- holds the product term Prod(m.guesses for m in sequence).
      // optimal.pi allows for fast (non-looping) updates to the minimization function.
      pi: (function () {
        const results = [];
        let _, u, ref;
        for (
          _ = u = 0, ref = n;
          0 <= ref ? u < ref : u > ref;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _ = 0 <= ref ? ++u : --u
        ) {
          results.push({});
        }
        return results;
      })(),
      // same structure as optimal.m -- holds the overall metric.
      g: (function () {
        const results = [];
        let _, u, ref;
        for (
          _ = u = 0, ref = n;
          0 <= ref ? u < ref : u > ref;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          _ = 0 <= ref ? ++u : --u
        ) {
          results.push({});
        }
        return results;
      })(),
    };
    // helper: considers whether a length-l sequence ending at match m is better (fewer guesses)
    // than previously encountered sequences, updating state if so.
    const update = (m, l) => {
      const k = m.j;
      let pi = this.estimate_guesses(m, password);
      if (l > 1) {
        // we're considering a length-l sequence ending with match m:
        // obtain the product term in the minimization function by multiplying m's guesses
        // by the product of the length-(l-1) sequence ending just before m, at m.i - 1.
        pi *= optimal.pi[m.i - 1][l - 1];
      }
      let g = this.factorial(l) * pi;
      if (!_exclude_additive) {
        g += Math.pow(MIN_GUESSES_BEFORE_GROWING_SEQUENCE, l - 1);
      }
      const ref = optimal.g[k];
      // update state if new best.
      // first see if any competing sequences covering this prefix, with l or fewer matches,
      // fare better than this sequence. if so, skip it and return.
      for (const competing_l in ref) {
        const competing_g = ref[competing_l];
        if (competing_l > l) {
          continue;
        }
        if (competing_g <= g) {
          return;
        }
      }
      // this sequence might be part of the final optimal sequence.
      optimal.g[k][l] = g;
      optimal.m[k][l] = m;
      return (optimal.pi[k][l] = pi);
    };
    // helper: evaluate bruteforce matches ending at k.
    const bruteforce_update = (k) => {
      // see if a single bruteforce match spanning the k-prefix is optimal.
      const m = make_bruteforce_match(0, k);
      update(m, 1);
      const results = [];
      let i, u, ref;
      for (
        i = u = 1, ref = k;
        1 <= ref ? u <= ref : u >= ref;
        i = 1 <= ref ? ++u : --u
      ) {
        // generate k bruteforce matches, spanning from (i=1, j=k) up to (i=k, j=k).
        // see if adding these new matches to any of the sequences in optimal[i-1]
        // leads to new bests.
        const m = make_bruteforce_match(i, k);
        results.push(
          (function () {
            const ref1 = optimal.m[i - 1];
            const results1 = [];
            for (const l in ref1) {
              const last_m = ref1[l];
              const li = parseInt(l);
              if (last_m.pattern === "bruteforce") {
                // corner: an optimal sequence will never have two adjacent bruteforce matches.
                // it is strictly better to have a single bruteforce match spanning the same region:
                // same contribution to the guess product with a lower length.
                // --> safe to skip those cases.
                continue;
              }
              // try adding m to this length-l sequence.
              results1.push(update(m, li + 1));
            }
            return results1;
          })()
        );
      }
      return results;
    };
    // helper: make bruteforce match objects spanning i to j, inclusive.
    const make_bruteforce_match = (i, j) => {
      return {
        pattern: "bruteforce",
        token: password.slice(i, +j + 1 || 9e9),
        i: i,
        j: j,
      };
    };
    // helper: step backwards through optimal.m starting at the end,
    // constructing the final optimal match sequence.
    const unwind = (n) => {
      const optimal_match_sequence = [];
      let k = n - 1;
      let l = void 0;
      // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
      let g = 2e308;
      const ref = optimal.g[k];
      for (const candidate_l in ref) {
        const candidate_g = ref[candidate_l];
        if (candidate_g < g) {
          l = candidate_l;
          g = candidate_g;
        }
      }
      while (k >= 0) {
        const m = optimal.m[k][l];
        optimal_match_sequence.unshift(m);
        k = m.i - 1;
        l--;
      }
      return optimal_match_sequence;
    };
    let k, u, ref;
    for (
      k = u = 0, ref = n;
      0 <= ref ? u < ref : u > ref;
      k = 0 <= ref ? ++u : --u
    ) {
      const ref1 = matches_by_j[k];
      for (let w = 0, len2 = ref1.length; w < len2; w++) {
        const m = ref1[w];
        if (m.i > 0) {
          for (const l in optimal.m[m.i - 1]) {
            const li = parseInt(l);
            update(m, li + 1);
          }
        } else {
          update(m, 1);
        }
      }
      bruteforce_update(k);
    }
    const optimal_match_sequence = unwind(n);
    const optimal_l = optimal_match_sequence.length;
    let guesses;
    // corner: empty password
    if (password.length === 0) {
      guesses = 1;
    } else {
      guesses = optimal.g[n - 1][optimal_l];
    }
    return {
      // final result object
      password: password,
      guesses: guesses,
      guesses_log10: this.log10(guesses),
      sequence: optimal_match_sequence,
    };
  },
  // ------------------------------------------------------------------------------
  // guess estimation -- one function per match pattern ---------------------------
  // ------------------------------------------------------------------------------
  estimate_guesses: function (match, password) {
    if (match.guesses != null) {
      return match.guesses; // a match's guess estimate doesn't change. cache it.
    }
    let min_guesses = 1;
    if (match.token.length < password.length) {
      min_guesses =
        match.token.length === 1
          ? MIN_SUBMATCH_GUESSES_SINGLE_CHAR
          : MIN_SUBMATCH_GUESSES_MULTI_CHAR;
    }
    const estimation_functions = {
      bruteforce: this.bruteforce_guesses,
      dictionary: this.dictionary_guesses,
      spatial: this.spatial_guesses,
      repeat: this.repeat_guesses,
      sequence: this.sequence_guesses,
      regex: this.regex_guesses,
      date: this.date_guesses,
    };
    const guesses = estimation_functions[match.pattern].call(this, match);
    match.guesses = Math.max(guesses, min_guesses);
    match.guesses_log10 = this.log10(match.guesses);
    return match.guesses;
  },
  bruteforce_guesses: function (match) {
    let guesses = Math.pow(BRUTEFORCE_CARDINALITY, match.token.length);
    if (guesses === Number.POSITIVE_INFINITY) {
      guesses = Number.MAX_VALUE;
    }
    // small detail: make bruteforce matches at minimum one guess bigger than smallest allowed
    // submatch guesses, such that non-bruteforce submatches over the same [i..j] take precedence.
    const min_guesses =
      match.token.length === 1
        ? MIN_SUBMATCH_GUESSES_SINGLE_CHAR + 1
        : MIN_SUBMATCH_GUESSES_MULTI_CHAR + 1;
    return Math.max(guesses, min_guesses);
  },
  repeat_guesses: function (match) {
    return match.base_guesses * match.repeat_count;
  },
  sequence_guesses: function (match) {
    const first_chr = match.token.charAt(0);
    // lower guesses for obvious starting points
    let base_guesses;
    if (
      first_chr === "a" ||
      first_chr === "A" ||
      first_chr === "z" ||
      first_chr === "Z" ||
      first_chr === "0" ||
      first_chr === "1" ||
      first_chr === "9"
    ) {
      base_guesses = 4;
    } else {
      if (first_chr.match(/\d/)) {
        base_guesses = 10; // digits
      } else {
        // could give a higher base for uppercase,
        // assigning 26 to both upper and lower sequences is more conservative.
        base_guesses = 26;
      }
    }
    if (!match.ascending) {
      // need to try a descending sequence in addition to every ascending sequence ->
      // 2x guesses
      base_guesses *= 2;
    }
    return base_guesses * match.token.length;
  },
  MIN_YEAR_SPACE: 20,
  REFERENCE_YEAR: new Date().getFullYear(),
  regex_guesses: function (match) {
    const char_class_bases = {
      alpha_lower: 26,
      alpha_upper: 26,
      alpha: 52,
      alphanumeric: 62,
      digits: 10,
      symbols: 33,
    };
    let year_space;
    if (match.regex_name in char_class_bases) {
      return Math.pow(char_class_bases[match.regex_name], match.token.length);
    } else {
      switch (match.regex_name) {
        case "recent_year":
          // conservative estimate of year space: num years from REFERENCE_YEAR.
          // if year is close to REFERENCE_YEAR, estimate a year space of MIN_YEAR_SPACE.
          year_space = Math.abs(
            parseInt(match.regex_match[0]) - this.REFERENCE_YEAR
          );
          year_space = Math.max(year_space, this.MIN_YEAR_SPACE);
          return year_space;
      }
    }
  },
  date_guesses: function (match) {
    // base guesses: (year distance from REFERENCE_YEAR) * num_days * num_years
    const year_space = Math.max(
      Math.abs(match.year - this.REFERENCE_YEAR),
      this.MIN_YEAR_SPACE
    );
    let guesses = year_space * 365;
    if (match.separator) {
      // add factor of 4 for separator selection (one of ~4 choices)
      guesses *= 4;
    }
    return guesses;
  },
  KEYBOARD_AVERAGE_DEGREE: calc_average_degree(adjacency_graphs.qwerty),
  // slightly different for keypad/mac keypad, but close enough
  KEYPAD_AVERAGE_DEGREE: calc_average_degree(adjacency_graphs.keypad),
  KEYBOARD_STARTING_POSITIONS: (function () {
    const ref = adjacency_graphs.qwerty;
    const results = [];
    for (const k in ref) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const v = ref[k];
      results.push(k);
    }
    return results;
  })().length,
  KEYPAD_STARTING_POSITIONS: (function () {
    const ref = adjacency_graphs.keypad;
    const results = [];
    for (const k in ref) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const v = ref[k];
      results.push(k);
    }
    return results;
  })().length,
  spatial_guesses: function (match) {
    let ref, s, d;
    if ((ref = match.graph) === "qwerty" || ref === "dvorak") {
      s = this.KEYBOARD_STARTING_POSITIONS;
      d = this.KEYBOARD_AVERAGE_DEGREE;
    } else {
      s = this.KEYPAD_STARTING_POSITIONS;
      d = this.KEYPAD_AVERAGE_DEGREE;
    }
    let guesses = 0;
    const L = match.token.length;
    const t = match.turns;
    // estimate the number of possible patterns w/ length L or less with t turns or less.
    let i, o, ref1, j, q, ref2, u, ref3;
    for (
      i = o = 2, ref1 = L;
      2 <= ref1 ? o <= ref1 : o >= ref1;
      i = 2 <= ref1 ? ++o : --o
    ) {
      const possible_turns = Math.min(t, i - 1);
      for (
        j = q = 1, ref2 = possible_turns;
        1 <= ref2 ? q <= ref2 : q >= ref2;
        j = 1 <= ref2 ? ++q : --q
      ) {
        guesses += this.nCk(i - 1, j - 1) * s * Math.pow(d, j);
      }
    }
    // add extra guesses for shifted keys. (% instead of 5, A instead of a.)
    // math is similar to extra guesses of l33t substitutions in dictionary matches.
    if (match.shifted_count) {
      const S = match.shifted_count;
      const U = match.token.length - match.shifted_count; // unshifted count
      if (S === 0 || U === 0) {
        guesses *= 2;
      } else {
        let shifted_variations = 0;
        for (
          i = u = 1, ref3 = Math.min(S, U);
          1 <= ref3 ? u <= ref3 : u >= ref3;
          i = 1 <= ref3 ? ++u : --u
        ) {
          shifted_variations += this.nCk(S + U, i);
        }
        guesses *= shifted_variations;
      }
    }
    return guesses;
  },
  dictionary_guesses: function (match) {
    match.base_guesses = match.rank; // keep these as properties for display purposes
    match.uppercase_variations = this.uppercase_variations(match);
    match.l33t_variations = this.l33t_variations(match);
    const reversed_variations = (match.reversed && 2) || 1;
    return (
      match.base_guesses *
      match.uppercase_variations *
      match.l33t_variations *
      reversed_variations
    );
  },
  START_UPPER: /^[A-Z][^A-Z]+$/,
  END_UPPER: /^[^A-Z]+[A-Z]$/,
  ALL_UPPER: /^[^a-z]+$/,
  ALL_LOWER: /^[^A-Z]+$/,
  uppercase_variations: function (match) {
    const word = match.token;
    if (word.match(this.ALL_LOWER) || word.toLowerCase() === word) {
      return 1;
    }
    const ref = [this.START_UPPER, this.END_UPPER, this.ALL_UPPER];
    // a capitalized word is the most common capitalization scheme,
    // so it only doubles the search space (uncapitalized + capitalized).
    // allcaps and end-capitalized are common enough too, underestimate as 2x factor to be safe.
    for (let o = 0, len = ref.length; o < len; o++) {
      const regex = ref[o];
      if (word.match(regex)) {
        return 2;
      }
    }
    // otherwise calculate the number of ways to capitalize U+L uppercase+lowercase letters
    // with U uppercase letters or less. or, if there's more uppercase than lower (for eg. PASSwORD),
    // the number of ways to lowercase U+L letters with L lowercase letters or less.
    const U = (function () {
      const ref1 = word.split("");
      const results = [];
      for (let q = 0, len1 = ref1.length; q < len1; q++) {
        const chr = ref1[q];
        if (chr.match(/[A-Z]/)) {
          results.push(chr);
        }
      }
      return results;
    })().length;
    const L = (function () {
      const ref1 = word.split("");
      const results = [];
      for (let q = 0, len1 = ref1.length; q < len1; q++) {
        const chr = ref1[q];
        if (chr.match(/[a-z]/)) {
          results.push(chr);
        }
      }
      return results;
    })().length;
    let variations = 0;
    let i, q, ref1;
    for (
      i = q = 1, ref1 = Math.min(U, L);
      1 <= ref1 ? q <= ref1 : q >= ref1;
      i = 1 <= ref1 ? ++q : --q
    ) {
      variations += this.nCk(U + L, i);
    }
    return variations;
  },
  l33t_variations: function (match) {
    if (!match.l33t) {
      return 1;
    }
    let variations = 1;
    const ref = match.sub;
    for (const subbed in ref) {
      const unsubbed = ref[subbed];
      // lower-case match.token before calculating: capitalization shouldn't affect l33t calc.
      const chrs = match.token.toLowerCase().split("");
      const S = (function () {
        const results = [];
        for (let o = 0, len = chrs.length; o < len; o++) {
          const chr = chrs[o];
          if (chr === subbed) {
            results.push(chr);
          }
        }
        return results;
      })().length; // num of subbed chars
      const U = (function () {
        const results = [];
        for (let o = 0, len = chrs.length; o < len; o++) {
          const chr = chrs[o];
          if (chr === unsubbed) {
            results.push(chr);
          }
        }
        return results;
      })().length; // num of unsubbed chars
      if (S === 0 || U === 0) {
        // for this sub, password is either fully subbed (444) or fully unsubbed (aaa)
        // treat that as doubling the space (attacker needs to try fully subbed chars in addition to
        // unsubbed.)
        variations *= 2;
      } else {
        // this case is similar to capitalization:
        // with aa44a, U = 3, S = 2, attacker needs to try unsubbed + one sub + two subs
        const p = Math.min(U, S);
        let possibilities = 0;
        let i, o, ref1;
        for (
          i = o = 1, ref1 = p;
          1 <= ref1 ? o <= ref1 : o >= ref1;
          i = 1 <= ref1 ? ++o : --o
        ) {
          possibilities += this.nCk(U + S, i);
        }
        variations *= possibilities;
      }
    }
    return variations;
  },
};

// utilities --------------------------------------------------------------------
export default scoring;
