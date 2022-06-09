import frequency_lists from "./frequency_lists";

import adjacency_graphs from "./adjacency_graphs";

import scoring from "./scoring";

const build_ranked_dict = function (ordered_list) {
  const result = {};
  let i = 1; // rank starts at 1, not 0
  for (let o = 0, len1 = ordered_list.length; o < len1; o++) {
    const word = ordered_list[o];
    result[word] = i;
    i += 1;
  }
  return result;
};

const RANKED_DICTIONARIES = {};

for (const name in frequency_lists) {
  const lst = frequency_lists[name];
  RANKED_DICTIONARIES[name] = build_ranked_dict(lst);
}

const GRAPHS = {
  qwerty: adjacency_graphs.qwerty,
  dvorak: adjacency_graphs.dvorak,
  keypad: adjacency_graphs.keypad,
  mac_keypad: adjacency_graphs.mac_keypad,
};

const L33T_TABLE = {
  a: ["4", "@"],
  b: ["8"],
  c: ["(", "{", "[", "<"],
  e: ["3"],
  g: ["6", "9"],
  i: ["1", "!", "|"],
  l: ["1", "|", "7"],
  o: ["0"],
  s: ["$", "5"],
  t: ["+", "7"],
  x: ["%"],
  z: ["2"],
};

const REGEXEN = {
  recent_year: /19\d\d|200\d|201\d/g,
};

const DATE_MAX_YEAR = 2050;

const DATE_MIN_YEAR = 1000;

const DATE_SPLITS = {
  4: [
    // for length-4 strings, eg 1191 or 9111, two ways to split:
    [
      1,
      2, // 1 1 91 (2nd split starts at index 1, 3rd at index 2)
    ],
    [
      2,
      3, // 91 1 1
    ],
  ],
  5: [
    [
      1,
      3, // 1 11 91
    ],
    [
      2,
      3, // 11 1 91
    ],
  ],
  6: [
    [
      1,
      2, // 1 1 1991
    ],
    [
      2,
      4, // 11 11 91
    ],
    [
      4,
      5, // 1991 1 1
    ],
  ],
  7: [
    [
      1,
      3, // 1 11 1991
    ],
    [
      2,
      3, // 11 1 1991
    ],
    [
      4,
      5, // 1991 1 11
    ],
    [
      4,
      6, // 1991 11 1
    ],
  ],
  8: [
    [
      2,
      4, // 11 11 1991
    ],
    [
      4,
      6, // 1991 11 11
    ],
  ],
};

const matching = {
  empty: function (obj) {
    return (
      (function () {
        const results = [];
        for (const k in obj) {
          results.push(k);
        }
        return results;
      })().length === 0
    );
  },
  extend: function (lst, lst2) {
    // eslint-disable-next-line prefer-spread
    return lst.push.apply(lst, lst2);
  },
  translate: function (string, chr_map) {
    return (function () {
      const ref = string.split("");
      const results = [];
      for (let o = 0, len1 = ref.length; o < len1; o++) {
        const chr = ref[o];
        results.push(chr_map[chr] || chr);
      }
      return results;
    })().join("");
  },
  mod: function (n, m) {
    return ((n % m) + m) % m; // mod impl that works for negative numbers
  },
  sorted: function (matches) {
    // sort on i primary, j secondary
    return matches.sort(function (m1, m2) {
      return m1.i - m2.i || m1.j - m2.j;
    });
  },
  // ------------------------------------------------------------------------------
  // omnimatch -- combine everything ----------------------------------------------
  // ------------------------------------------------------------------------------
  omnimatch: function (password) {
    const matches = [];
    const matchers = [
      this.dictionary_match,
      this.reverse_dictionary_match,
      this.l33t_match,
      this.spatial_match,
      this.repeat_match,
      this.sequence_match,
      this.regex_match,
      this.date_match,
    ];
    for (let o = 0, len1 = matchers.length; o < len1; o++) {
      const matcher = matchers[o];
      this.extend(matches, matcher.call(this, password));
    }
    return this.sorted(matches);
  },
  //-------------------------------------------------------------------------------
  // dictionary match (common passwords, english, last names, etc) ----------------
  //-------------------------------------------------------------------------------
  dictionary_match: function (
    password,
    _ranked_dictionaries = RANKED_DICTIONARIES
  ) {
    // _ranked_dictionaries variable is for unit testing purposes
    const matches = [];
    const len = password.length;
    const password_lower = password.toLowerCase();
    for (const dictionary_name in _ranked_dictionaries) {
      const ranked_dict = _ranked_dictionaries[dictionary_name];
      let i, o, ref, j, p, ref1, ref2;
      for (
        i = o = 0, ref = len;
        0 <= ref ? o < ref : o > ref;
        i = 0 <= ref ? ++o : --o
      ) {
        for (
          j = p = ref1 = i, ref2 = len;
          ref1 <= ref2 ? p < ref2 : p > ref2;
          j = ref1 <= ref2 ? ++p : --p
        ) {
          if (password_lower.slice(i, +j + 1 || 9e9) in ranked_dict) {
            const word = password_lower.slice(i, +j + 1 || 9e9);
            const rank = ranked_dict[word];
            matches.push({
              pattern: "dictionary",
              i: i,
              j: j,
              token: password.slice(i, +j + 1 || 9e9),
              matched_word: word,
              rank: rank,
              dictionary_name: dictionary_name,
              reversed: false,
              l33t: false,
            });
          }
        }
      }
    }
    return this.sorted(matches);
  },
  reverse_dictionary_match: function (
    password,
    _ranked_dictionaries = RANKED_DICTIONARIES
  ) {
    const reversed_password = password.split("").reverse().join("");
    const matches = this.dictionary_match(
      reversed_password,
      _ranked_dictionaries
    );
    for (let o = 0, len1 = matches.length; o < len1; o++) {
      const match = matches[o];
      match.token = match.token.split("").reverse().join(""); // reverse back
      match.reversed = true;
      // map coordinates back to original string
      [match.i, match.j] = [
        password.length - 1 - match.j,
        password.length - 1 - match.i,
      ];
    }
    return this.sorted(matches);
  },
  set_user_input_dictionary: function (ordered_list) {
    return (RANKED_DICTIONARIES["user_inputs"] = build_ranked_dict(
      ordered_list.slice()
    ));
  },
  //-------------------------------------------------------------------------------
  // dictionary match with common l33t substitutions ------------------------------
  //-------------------------------------------------------------------------------

  // makes a pruned copy of l33t_table that only includes password's possible substitutions
  relevant_l33t_subtable: function (password, table) {
    const password_chars = {};
    const ref = password.split("");
    for (let o = 0, len1 = ref.length; o < len1; o++) {
      const chr = ref[o];
      password_chars[chr] = true;
    }
    const subtable = {};
    for (const letter in table) {
      const subs = table[letter];
      const relevant_subs = (function () {
        const results = [];
        for (let p = 0, len2 = subs.length; p < len2; p++) {
          const sub = subs[p];
          if (sub in password_chars) {
            results.push(sub);
          }
        }
        return results;
      })();
      if (relevant_subs.length > 0) {
        subtable[letter] = relevant_subs;
      }
    }
    return subtable;
  },
  // returns the list of possible 1337 replacement dictionaries for a given password
  enumerate_l33t_subs: function (table) {
    const keys = (function () {
      const results = [];
      for (const k in table) {
        results.push(k);
      }
      return results;
    })();
    const subs = [[]];
    const dedup = function (subs) {
      const deduped = [];
      const members = {};
      for (let o = 0, len1 = subs.length; o < len1; o++) {
        const sub = subs[o];
        const assoc = (function () {
          const results = [];
          let p;
          for (let v = (p = 0), len2 = sub.length; p < len2; v = ++p) {
            const k = sub[v];
            results.push([k, v]);
          }
          return results;
        })();
        assoc.sort();
        const label = (function () {
          const results = [];
          let p;
          for (let v = (p = 0), len2 = assoc.length; p < len2; v = ++p) {
            const k = assoc[v];
            results.push(k + "," + v);
          }
          return results;
        })().join("-");
        if (!(label in members)) {
          members[label] = true;
          deduped.push(sub);
        }
      }
      return deduped;
    };
    const helper = function (keys) {
      if (!keys.length) {
        return;
      }
      const first_key = keys[0];
      const rest_keys = keys.slice(1);
      const next_subs = [];
      const ref = table[first_key];
      for (let o = 0, len1 = ref.length; o < len1; o++) {
        const l33t_chr = ref[o];
        const subs = dedup(next_subs);
        for (let p = 0, len2 = subs.length; p < len2; p++) {
          const sub = subs[p];
          let dup_l33t_index = -1;
          let i, q, ref1;
          for (
            i = q = 0, ref1 = sub.length;
            0 <= ref1 ? q < ref1 : q > ref1;
            i = 0 <= ref1 ? ++q : --q
          ) {
            if (sub[i][0] === l33t_chr) {
              dup_l33t_index = i;
              break;
            }
          }
          if (dup_l33t_index === -1) {
            const sub_extension = sub.concat([[l33t_chr, first_key]]);
            next_subs.push(sub_extension);
          } else {
            const sub_alternative = sub.slice(0);
            sub_alternative.splice(dup_l33t_index, 1);
            sub_alternative.push([l33t_chr, first_key]);
            next_subs.push(sub);
            next_subs.push(sub_alternative);
          }
        }
      }
      return helper(rest_keys);
    };
    helper(keys);
    const sub_dicts = []; // convert from assoc lists to dicts
    for (let o = 0, len1 = subs.length; o < len1; o++) {
      const sub = subs[o];
      const sub_dict = {};
      for (let p = 0, len2 = sub.length; p < len2; p++) {
        const [l33t_chr, chr] = sub[p];
        sub_dict[l33t_chr] = chr;
      }
      sub_dicts.push(sub_dict);
    }
    return sub_dicts;
  },
  l33t_match: function (
    password,
    _ranked_dictionaries = RANKED_DICTIONARIES,
    _l33t_table = L33T_TABLE
  ) {
    const matches = [];
    const ref = this.enumerate_l33t_subs(
      this.relevant_l33t_subtable(password, _l33t_table)
    );
    for (let o = 0, len1 = ref.length; o < len1; o++) {
      const sub = ref[o];
      if (this.empty(sub)) {
        // corner case: password has no relevant subs.
        break;
      }
      const subbed_password = this.translate(password, sub);
      const ref1 = this.dictionary_match(subbed_password, _ranked_dictionaries);
      let p, len2;
      for (p = 0, len2 = ref1.length; p < len2; p++) {
        const match = ref1[p];
        const token = password.slice(match.i, +match.j + 1 || 9e9);
        if (token.toLowerCase() === match.matched_word) {
          continue; // only return the matches that contain an actual substitution
        }
        const match_sub = {}; // subset of mappings in sub that are in use for this match
        for (const subbed_chr in sub) {
          const chr = sub[subbed_chr];
          if (token.indexOf(subbed_chr) !== -1) {
            match_sub[subbed_chr] = chr;
          }
        }
        match.l33t = true;
        match.token = token;
        match.sub = match_sub;
        match.sub_display = (function () {
          const results = [];
          for (const k in match_sub) {
            const v = match_sub[k];
            results.push(`${k} -> ${v}`);
          }
          return results;
        })().join(", ");
        matches.push(match);
      }
    }
    return this.sorted(
      matches.filter(function (match) {
        // filter single-character l33t matches to reduce noise.
        // otherwise '1' matches 'i', '4' matches 'a', both very common English words
        // with low dictionary rank.
        return match.token.length > 1;
      })
    );
  },
  // ------------------------------------------------------------------------------
  // spatial match (qwerty/dvorak/keypad) -----------------------------------------
  // ------------------------------------------------------------------------------
  spatial_match: function (password, _graphs = GRAPHS) {
    const matches = [];
    for (const graph_name in _graphs) {
      const graph = _graphs[graph_name];
      this.extend(
        matches,
        this.spatial_match_helper(password, graph, graph_name)
      );
    }
    return this.sorted(matches);
  },
  SHIFTED_RX: /[~!@#$%^&*()_+QWERTYUIOP{}|ASDFGHJKL:"ZXCVBNM<>?]/,
  spatial_match_helper: function (password, graph, graph_name) {
    const matches = [];
    let i = 0;
    while (i < password.length - 1) {
      let j = i + 1;
      let last_direction = null;
      let turns = 0;
      let shifted_count;
      if (
        (graph_name === "qwerty" || graph_name === "dvorak") &&
        this.SHIFTED_RX.exec(password.charAt(i))
      ) {
        // initial character is shifted
        shifted_count = 1;
      } else {
        shifted_count = 0;
      }
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const prev_char = password.charAt(j - 1);
        let found = false;
        let found_direction = -1;
        let cur_direction = -1;
        const adjacents = graph[prev_char] || [];
        // consider growing pattern by one character if j hasn't gone over the edge.
        if (j < password.length) {
          const cur_char = password.charAt(j);
          for (let o = 0, len1 = adjacents.length; o < len1; o++) {
            const adj = adjacents[o];
            cur_direction += 1;
            if (adj && adj.indexOf(cur_char) !== -1) {
              found = true;
              found_direction = cur_direction;
              if (adj.indexOf(cur_char) === 1) {
                // index 1 in the adjacency means the key is shifted,
                // 0 means unshifted: A vs a, % vs 5, etc.
                // for example, 'q' is adjacent to the entry '2@'.
                // @ is shifted w/ index 1, 2 is unshifted.
                shifted_count += 1;
              }
              if (last_direction !== found_direction) {
                // adding a turn is correct even in the initial case when last_direction is null:
                // every spatial pattern starts with a turn.
                turns += 1;
                last_direction = found_direction;
              }
              break;
            }
          }
        }
        // if the current pattern continued, extend j and try to grow again
        if (found) {
          j += 1;
        } else {
          // otherwise push the pattern discovered so far, if any...
          if (j - i > 2) {
            // don't consider length 1 or 2 chains.
            matches.push({
              pattern: "spatial",
              i: i,
              j: j - 1,
              token: password.slice(i, j),
              graph: graph_name,
              turns: turns,
              shifted_count: shifted_count,
            });
          }
          // ...and then start a new search for the rest of the password.
          i = j;
          break;
        }
      }
    }
    return matches;
  },
  //-------------------------------------------------------------------------------
  // repeats (aaa, abcabcabc) and sequences (abcdef) ------------------------------
  //-------------------------------------------------------------------------------
  repeat_match: function (password) {
    const matches = [];
    const greedy = /(.+)\1+/g;
    const lazy = /(.+?)\1+/g;
    const lazy_anchored = /^(.+?)\1+$/;
    let lastIndex = 0;
    let base_token, match;
    while (lastIndex < password.length) {
      greedy.lastIndex = lazy.lastIndex = lastIndex;
      const greedy_match = greedy.exec(password);
      const lazy_match = lazy.exec(password);
      if (greedy_match == null) {
        break;
      }
      if (greedy_match[0].length > lazy_match[0].length) {
        // greedy beats lazy for 'aabaab'
        //   greedy: [aabaab, aab]
        //   lazy:   [aa,     a]
        const match = greedy_match;
        // greedy's repeated string might itself be repeated, eg.
        // aabaab in aabaabaabaab.
        // run an anchored lazy match on greedy's repeated string
        // to find the shortest repeated string
        base_token = lazy_anchored.exec(match[0])[1];
      } else {
        // lazy beats greedy for 'aaaaa'
        //   greedy: [aaaa,  aa]
        //   lazy:   [aaaaa, a]
        match = lazy_match;
        base_token = match[1];
      }
      const [i, j] = [match.index, match.index + match[0].length - 1];
      // recursively match and score the base string
      const base_analysis = scoring.most_guessable_match_sequence(
        base_token,
        this.omnimatch(base_token)
      );
      const base_matches = base_analysis.sequence;
      const base_guesses = base_analysis.guesses;
      matches.push({
        pattern: "repeat",
        i: i,
        j: j,
        token: match[0],
        base_token: base_token,
        base_guesses: base_guesses,
        base_matches: base_matches,
        repeat_count: match[0].length / base_token.length,
      });
      lastIndex = j + 1;
    }
    return matches;
  },
  MAX_DELTA: 5,
  sequence_match: function (password) {
    // Identifies sequences by looking for repeated differences in unicode codepoint.
    // this allows skipping, such as 9753, and also matches some extended unicode sequences
    // such as Greek and Cyrillic alphabets.

    // for example, consider the input 'abcdb975zy'

    // password: a   b   c   d   b    9   7   5   z   y
    // index:    0   1   2   3   4    5   6   7   8   9
    // delta:      1   1   1  -2  -41  -2  -2  69   1

    // expected result:
    // [(i, j, delta), ...] = [(0, 3, 1), (5, 7, -2), (8, 9, 1)]
    if (password.length === 1) {
      return [];
    }
    const update = (i, j, delta) => {
      let ref, sequence_name, sequence_space, token;
      if (j - i > 1 || Math.abs(delta) === 1) {
        if (0 < (ref = Math.abs(delta)) && ref <= this.MAX_DELTA) {
          token = password.slice(i, +j + 1 || 9e9);
          if (/^[a-z]+$/.test(token)) {
            sequence_name = "lower";
            sequence_space = 26;
          } else if (/^[A-Z]+$/.test(token)) {
            sequence_name = "upper";
            sequence_space = 26;
          } else if (/^\d+$/.test(token)) {
            sequence_name = "digits";
            sequence_space = 10;
          } else {
            // conservatively stick with roman alphabet size.
            // (this could be improved)
            sequence_name = "unicode";
            sequence_space = 26;
          }
          return result.push({
            pattern: "sequence",
            i: i,
            j: j,
            token: password.slice(i, +j + 1 || 9e9),
            sequence_name: sequence_name,
            sequence_space: sequence_space,
            ascending: delta > 0,
          });
        }
      }
    };
    const result = [];
    let i = 0;
    let last_delta = null;
    let k, o, ref;
    for (
      k = o = 1, ref = password.length;
      1 <= ref ? o < ref : o > ref;
      k = 1 <= ref ? ++o : --o
    ) {
      const delta = password.charCodeAt(k) - password.charCodeAt(k - 1);
      if (last_delta == null) {
        last_delta = delta;
      }
      if (delta === last_delta) {
        continue;
      }
      const j = k - 1;
      update(i, j, last_delta);
      i = j;
      last_delta = delta;
    }
    update(i, password.length - 1, last_delta);
    return result;
  },
  //-------------------------------------------------------------------------------
  // regex matching ---------------------------------------------------------------
  //-------------------------------------------------------------------------------
  regex_match: function (password, _regexen = REGEXEN) {
    const matches = [];
    let rx_match;
    for (const name in _regexen) {
      const regex = _regexen[name];
      regex.lastIndex = 0; // keeps regex_match stateless
      while ((rx_match = regex.exec(password))) {
        const token = rx_match[0];
        matches.push({
          pattern: "regex",
          token: token,
          i: rx_match.index,
          j: rx_match.index + rx_match[0].length - 1,
          regex_name: name,
          regex_match: rx_match,
        });
      }
    }
    return this.sorted(matches);
  },
  //-------------------------------------------------------------------------------
  // date matching ----------------------------------------------------------------
  //-------------------------------------------------------------------------------
  date_match: function (password) {
    // a "date" is recognized as:
    //   any 3-tuple that starts or ends with a 2- or 4-digit year,
    //   with 2 or 0 separator chars (1.1.91 or 1191),
    //   maybe zero-padded (01-01-91 vs 1-1-91),
    //   a month between 1 and 12,
    //   a day between 1 and 31.

    // note: this isn't true date parsing in that "feb 31st" is allowed,
    // this doesn't check for leap years, etc.

    // recipe:
    // start with regex to find maybe-dates, then attempt to map the integers
    // onto month-day-year to filter the maybe-dates into dates.
    // finally, remove matches that are substrings of other matches to reduce noise.

    // note: instead of using a lazy or greedy regex to find many dates over the full string,
    // this uses a ^...$ regex against every substring of the password -- less performant but leads
    // to every possible date match.
    const matches = [];
    const maybe_date_no_separator = /^\d{4,8}$/;
    const maybe_date_with_separator =
      /^(\d{1,4})([\s\\/\\_.-])(\d{1,2})\2(\d{1,4})$/; // day, month, year
    // separator
    // day, month
    // same separator
    // day, month, year
    // dates without separators are between length 4 '1191' and 8 '11111991'
    let i, o, ref, j, p, ref1, ref2, ref5, s, t, ref6, ref7;
    for (
      i = o = 0, ref = password.length - 4;
      0 <= ref ? o <= ref : o >= ref;
      i = 0 <= ref ? ++o : --o
    ) {
      for (
        j = p = ref1 = i + 3, ref2 = i + 7;
        ref1 <= ref2 ? p <= ref2 : p >= ref2;
        j = ref1 <= ref2 ? ++p : --p
      ) {
        if (j >= password.length) {
          break;
        }
        const token = password.slice(i, +j + 1 || 9e9);
        if (!maybe_date_no_separator.exec(token)) {
          continue;
        }
        const candidates = [];
        const ref3 = DATE_SPLITS[token.length];
        for (let q = 0, len1 = ref3.length; q < len1; q++) {
          const [k, l] = ref3[q];
          const dmy = this.map_ints_to_dmy([
            parseInt(token.slice(0, k)),
            parseInt(token.slice(k, l)),
            parseInt(token.slice(l)),
          ]);
          if (dmy != null) {
            candidates.push(dmy);
          }
        }
        if (!(candidates.length > 0)) {
          continue;
        }
        let best_candidate = candidates[0];
        const metric = function (candidate) {
          return Math.abs(candidate.year - scoring.REFERENCE_YEAR);
        };
        let min_distance = metric(candidates[0]);
        const ref4 = candidates.slice(1);
        for (let r = 0, len2 = ref4.length; r < len2; r++) {
          const candidate = ref4[r];
          const distance = metric(candidate);
          if (distance < min_distance) {
            [best_candidate, min_distance] = [candidate, distance];
          }
        }
        matches.push({
          pattern: "date",
          token: token,
          i: i,
          j: j,
          separator: "",
          year: best_candidate.year,
          month: best_candidate.month,
          day: best_candidate.day,
        });
      }
    }
    // dates with separators are between length 6 '1/1/91' and 10 '11/11/1991'
    for (
      i = s = 0, ref5 = password.length - 6;
      0 <= ref5 ? s <= ref5 : s >= ref5;
      i = 0 <= ref5 ? ++s : --s
    ) {
      for (
        j = t = ref6 = i + 5, ref7 = i + 9;
        ref6 <= ref7 ? t <= ref7 : t >= ref7;
        j = ref6 <= ref7 ? ++t : --t
      ) {
        if (j >= password.length) {
          break;
        }
        const token = password.slice(i, +j + 1 || 9e9);
        const rx_match = maybe_date_with_separator.exec(token);
        if (rx_match == null) {
          continue;
        }
        const dmy = this.map_ints_to_dmy([
          parseInt(rx_match[1]),
          parseInt(rx_match[3]),
          parseInt(rx_match[4]),
        ]);
        if (dmy == null) {
          continue;
        }
        matches.push({
          pattern: "date",
          token: token,
          i: i,
          j: j,
          separator: rx_match[2],
          year: dmy.year,
          month: dmy.month,
          day: dmy.day,
        });
      }
    }
    // matches now contains all valid date strings in a way that is tricky to capture
    // with regexes only. while thorough, it will contain some unintuitive noise:

    // '2015_06_04', in addition to matching 2015_06_04, will also contain
    // 5(!) other date matches: 15_06_04, 5_06_04, ..., even 2015 (matched as 5/1/2020)

    // to reduce noise, remove date matches that are strict substrings of others
    return this.sorted(
      matches.filter(function (match) {
        let is_submatch, len3, other_match, u;
        is_submatch = false;
        for (u = 0, len3 = matches.length; u < len3; u++) {
          other_match = matches[u];
          if (match === other_match) {
            continue;
          }
          if (other_match.i <= match.i && other_match.j >= match.j) {
            is_submatch = true;
            break;
          }
        }
        return !is_submatch;
      })
    );
  },
  map_ints_to_dmy: function (ints) {
    // given a 3-tuple, discard if:
    //   middle int is over 31 (for all dmy formats, years are never allowed in the middle)
    //   middle int is zero
    //   any int is over the max allowable year
    //   any int is over two digits but under the min allowable year
    //   2 ints are over 31, the max allowable day
    //   2 ints are zero
    //   all ints are over 12, the max allowable month
    if (ints[1] > 31 || ints[1] <= 0) {
      return;
    }
    let over_12 = 0;
    let over_31 = 0;
    let under_1 = 0;
    for (let o = 0, len1 = ints.length; o < len1; o++) {
      const int = ints[o];
      if ((99 < int && int < DATE_MIN_YEAR) || int > DATE_MAX_YEAR) {
        return;
      }
      if (int > 31) {
        over_31 += 1;
      }
      if (int > 12) {
        over_12 += 1;
      }
      if (int <= 0) {
        under_1 += 1;
      }
    }
    if (over_31 >= 2 || over_12 === 3 || under_1 >= 2) {
      return;
    }
    // first look for a four digit year: yyyy + daymonth or daymonth + yyyy
    const possible_year_splits = [
      [ints[2], ints.slice(0, 2)],
      [ints[0], ints.slice(1, 3)],
    ];
    for (let p = 0, len2 = possible_year_splits.length; p < len2; p++) {
      const [y, rest] = possible_year_splits[p];
      if (DATE_MIN_YEAR <= y && y <= DATE_MAX_YEAR) {
        const dm = this.map_ints_to_dm(rest);
        if (dm != null) {
          return {
            year: y,
            month: dm.month,
            day: dm.day,
          };
        } else {
          return;
        }
      }
    }
    // given no four-digit year, two digit years are the most flexible int to match, so
    // try to parse a day-month out of ints[0..1] or ints[1..0]
    // for a candidate that includes a four-digit year,
    // when the remaining ints don't match to a day and month,
    // it is not a date.
    for (let q = 0, len3 = possible_year_splits.length; q < len3; q++) {
      const [y, rest] = possible_year_splits[q];
      const dm = this.map_ints_to_dm(rest);
      if (dm != null) {
        const y2 = this.two_to_four_digit_year(y);
        return {
          year: y2,
          month: dm.month,
          day: dm.day,
        };
      }
    }
  },
  map_ints_to_dm: function (ints) {
    const ref = [ints, ints.slice().reverse()];
    for (let o = 0, len1 = ref.length; o < len1; o++) {
      const [d, m] = ref[o];
      if (1 <= d && d <= 31 && 1 <= m && m <= 12) {
        return {
          day: d,
          month: m,
        };
      }
    }
  },
  two_to_four_digit_year: function (year) {
    if (year > 99) {
      return year;
    } else if (year > 50) {
      // 87 -> 1987
      return year + 1900;
    } else {
      // 15 -> 2015
      return year + 2000;
    }
  },
};

export default matching;
