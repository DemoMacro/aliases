#!/usr/bin/env node
import { getStaticData, time } from "./types";

// ----------------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------------
(function () {
  getStaticData().then((data) => {
    data.time = time();
    console.log(JSON.stringify(data, null, 2));
  });
})();
