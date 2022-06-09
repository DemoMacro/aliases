import zxcvbnAliases from "@aliases/zxcvbn";
import zxcvbn from "zxcvbn";

console.time("@aliases/zxcvbn");
zxcvbnAliases("abc123");
console.timeEnd("@aliases/zxcvbn");

console.time("zxcvbn");
zxcvbn("abc123");
console.timeEnd("zxcvbn");
