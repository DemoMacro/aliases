import matching from "./matching";

import scoring from "./scoring";

import time_estimates from "./time_estimates";

import feedback from "./feedback";

const time = function () {
  return new Date().getTime();
};

const zxcvbn = function (password: string, user_inputs = []) {
  const start = time();
  // reset the user inputs matcher on a per-request basis to keep things stateless
  const sanitized_inputs = [];
  for (let i = 0, len = user_inputs.length; i < len; i++) {
    const arg = user_inputs[i];
    const ref = typeof arg;
    if (ref === "string" || ref === "number" || ref === "boolean") {
      sanitized_inputs.push(arg.toString().toLowerCase());
    }
  }
  matching.set_user_input_dictionary(sanitized_inputs);
  const matches = matching.omnimatch(password);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = scoring.most_guessable_match_sequence(password, matches);
  result.calc_time = time() - start;
  const attack_times = time_estimates.estimate_attack_times(result.guesses);
  for (const prop in attack_times) {
    const val = attack_times[prop];
    result[prop] = val;
  }
  result.feedback = feedback.get_feedback(result.score, result.sequence);
  return result;
};

export default zxcvbn;
