import { exec } from "child_process";
import { existsSync, readFileSync, readFile } from "fs";
import { getValue, powerShell, promiseAll, toInt } from "./util";

let _platform = process.platform;

const _linux = _platform === "linux" || _platform === "android";
const _darwin = _platform === "darwin";
const _windows = _platform === "win32";
const _freebsd = _platform === "freebsd";
const _openbsd = _platform === "openbsd";
const _netbsd = _platform === "netbsd";
const _sunos = _platform === "sunos";

function parseWinBatteryPart(lines, designedCapacity, fullChargeCapacity) {
  const result = {};
  let status = getValue(lines, "BatteryStatus", ":").trim();
  // 1 = "Discharging"
  // 2 = "On A/C"
  // 3 = "Fully Charged"
  // 4 = "Low"
  // 5 = "Critical"
  // 6 = "Charging"
  // 7 = "Charging High"
  // 8 = "Charging Low"
  // 9 = "Charging Critical"
  // 10 = "Undefined"
  // 11 = "Partially Charged"
  if (status >= 0) {
    const statusValue = status ? parseInt(status) : 0;
    result.status = statusValue;
    result.hasBattery = true;
    result.maxCapacity =
      fullChargeCapacity ||
      parseInt(getValue(lines, "DesignCapacity", ":") || 0);
    result.designedCapacity = parseInt(
      getValue(lines, "DesignCapacity", ":") || designedCapacity
    );
    result.voltage =
      parseInt(getValue(lines, "DesignVoltage", ":") || 0) / 1000.0;
    result.capacityUnit = "mWh";
    result.percent = parseInt(
      getValue(lines, "EstimatedChargeRemaining", ":") || 0
    );
    result.currentCapacity = parseInt(
      (result.maxCapacity * result.percent) / 100
    );
    result.isCharging =
      (statusValue >= 6 && statusValue <= 9) ||
      statusValue === 11 ||
      (!(statusValue === 3) && !(statusValue === 1) && result.percent < 100);
    result.acConnected = result.isCharging || statusValue === 2;
    result.model = getValue(lines, "DeviceID", ":");
  } else {
    result.status = -1;
  }

  return result;
}

export default function (callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = {
        hasBattery: false,
        cycleCount: 0,
        isCharging: false,
        designedCapacity: 0,
        maxCapacity: 0,
        currentCapacity: 0,
        voltage: 0,
        capacityUnit: "",
        percent: 0,
        timeRemaining: null,
        acConnected: true,
        type: "",
        model: "",
        manufacturer: "",
        serial: "",
      };

      if (_linux) {
        let battery_path = "";
        if (existsSync("/sys/class/power_supply/BAT1/uevent")) {
          battery_path = "/sys/class/power_supply/BAT1/";
        } else if (existsSync("/sys/class/power_supply/BAT0/uevent")) {
          battery_path = "/sys/class/power_supply/BAT0/";
        }

        let acConnected = false;
        let acPath = "";
        if (existsSync("/sys/class/power_supply/AC/online")) {
          acPath = "/sys/class/power_supply/AC/online";
        } else if (existsSync("/sys/class/power_supply/AC0/online")) {
          acPath = "/sys/class/power_supply/AC0/online";
        }

        if (acPath) {
          const file = readFileSync(acPath);
          acConnected = file.toString().trim() === "1";
        }

        if (battery_path) {
          readFile(battery_path + "uevent", function (error, stdout) {
            if (!error) {
              let lines = stdout.toString().split("\n");

              result.isCharging =
                getValue(lines, "POWER_SUPPLY_STATUS", "=").toLowerCase() ===
                "charging";
              result.acConnected = acConnected || result.isCharging;
              result.voltage =
                parseInt(
                  "0" + getValue(lines, "POWER_SUPPLY_VOLTAGE_NOW", "="),
                  10
                ) / 1000000.0;
              result.capacityUnit = result.voltage ? "mWh" : "mAh";
              result.cycleCount = parseInt(
                "0" + getValue(lines, "POWER_SUPPLY_CYCLE_COUNT", "="),
                10
              );
              result.maxCapacity = Math.round(
                (parseInt(
                  "0" +
                    getValue(
                      lines,
                      "POWER_SUPPLY_CHARGE_FULL",
                      "=",
                      true,
                      true
                    ),
                  10
                ) /
                  1000.0) *
                  (result.voltage || 1)
              );
              const desingedMinVoltage =
                parseInt(
                  "0" + getValue(lines, "POWER_SUPPLY_VOLTAGE_MIN_DESIGN", "="),
                  10
                ) / 1000000.0;
              result.designedCapacity = Math.round(
                (parseInt(
                  "0" +
                    getValue(
                      lines,
                      "POWER_SUPPLY_CHARGE_FULL_DESIGN",
                      "=",
                      true,
                      true
                    ),
                  10
                ) /
                  1000.0) *
                  (desingedMinVoltage || result.voltage || 1)
              );
              result.currentCapacity = Math.round(
                (parseInt(
                  "0" + getValue(lines, "POWER_SUPPLY_CHARGE_NOW", "="),
                  10
                ) /
                  1000.0) *
                  (result.voltage || 1)
              );
              if (!result.maxCapacity) {
                result.maxCapacity =
                  parseInt(
                    "0" +
                      getValue(
                        lines,
                        "POWER_SUPPLY_ENERGY_FULL",
                        "=",
                        true,
                        true
                      ),
                    10
                  ) / 1000.0;
                result.designedCapacity =
                  (parseInt(
                    "0" +
                      getValue(
                        lines,
                        "POWER_SUPPLY_ENERGY_FULL_DESIGN",
                        "=",
                        true,
                        true
                      ),
                    10
                  ) /
                    1000.0) |
                  result.maxCapacity;
                result.currentCapacity =
                  parseInt(
                    "0" + getValue(lines, "POWER_SUPPLY_ENERGY_NOW", "="),
                    10
                  ) / 1000.0;
              }
              const percent = getValue(lines, "POWER_SUPPLY_CAPACITY", "=");
              const energy = parseInt(
                "0" + getValue(lines, "POWER_SUPPLY_ENERGY_NOW", "="),
                10
              );
              const power = parseInt(
                "0" + getValue(lines, "POWER_SUPPLY_POWER_NOW", "="),
                10
              );
              const current = parseInt(
                "0" + getValue(lines, "POWER_SUPPLY_CURRENT_NOW", "="),
                10
              );

              result.percent = parseInt("0" + percent, 10);
              if (result.maxCapacity && result.currentCapacity) {
                result.hasBattery = true;
                if (!percent) {
                  result.percent =
                    (100.0 * result.currentCapacity) / result.maxCapacity;
                }
              }
              if (result.isCharging) {
                result.hasBattery = true;
              }
              if (energy && power) {
                result.timeRemaining = Math.floor((energy / power) * 60);
              } else if (current && result.currentCapacity) {
                result.timeRemaining = Math.floor(
                  (result.currentCapacity / current) * 60
                );
              }
              result.type = getValue(lines, "POWER_SUPPLY_TECHNOLOGY", "=");
              result.model = getValue(lines, "POWER_SUPPLY_MODEL_NAME", "=");
              result.manufacturer = getValue(
                lines,
                "POWER_SUPPLY_MANUFACTURER",
                "="
              );
              result.serial = getValue(
                lines,
                "POWER_SUPPLY_SERIAL_NUMBER",
                "="
              );
              if (callback) {
                callback(result);
              }
              resolve(result);
            } else {
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          });
        } else {
          if (callback) {
            callback(result);
          }
          resolve(result);
        }
      }
      if (_freebsd || _openbsd || _netbsd) {
        exec(
          "sysctl -i hw.acpi.battery hw.acpi.acline",
          function (error, stdout) {
            let lines = stdout.toString().split("\n");
            const batteries = parseInt(
              "0" + getValue(lines, "hw.acpi.battery.units"),
              10
            );
            const percent = parseInt(
              "0" + getValue(lines, "hw.acpi.battery.life"),
              10
            );
            result.hasBattery = batteries > 0;
            result.cycleCount = null;
            result.isCharging = getValue(lines, "hw.acpi.acline") !== "1";
            result.acConnected = result.isCharging;
            result.maxCapacity = null;
            result.currentCapacity = null;
            result.capacityUnit = "unknown";
            result.percent = batteries ? percent : null;
            if (callback) {
              callback(result);
            }
            resolve(result);
          }
        );
      }

      if (_darwin) {
        exec(
          'ioreg -n AppleSmartBattery -r | egrep "CycleCount|IsCharging|DesignCapacity|MaxCapacity|CurrentCapacity|BatterySerialNumber|TimeRemaining|Voltage"; pmset -g batt | grep %',
          function (error, stdout) {
            if (stdout) {
              let lines = stdout
                .toString()
                .replace(/ +/g, "")
                .replace(/"+/g, "")
                .replace(/-/g, "")
                .split("\n");
              result.cycleCount = parseInt(
                "0" + getValue(lines, "cyclecount", "="),
                10
              );
              result.voltage =
                parseInt("0" + getValue(lines, "voltage", "="), 10) / 1000.0;
              result.capacityUnit = result.voltage ? "mWh" : "mAh";
              result.maxCapacity = Math.round(
                parseInt(
                  "0" + getValue(lines, "applerawmaxcapacity", "="),
                  10
                ) * (result.voltage || 1)
              );
              result.currentCapacity = Math.round(
                parseInt(
                  "0" + getValue(lines, "applerawcurrentcapacity", "="),
                  10
                ) * (result.voltage || 1)
              );
              result.designedCapacity = Math.round(
                parseInt("0" + getValue(lines, "DesignCapacity", "="), 10) *
                  (result.voltage || 1)
              );
              result.manufacturer = "Apple";
              result.serial = getValue(lines, "BatterySerialNumber", "=");
              let percent = null;
              const line = getValue(lines, "internal", "Battery");
              let parts = line.split(";");
              if (parts && parts[0]) {
                let parts2 = parts[0].split("\t");
                if (parts2 && parts2[1]) {
                  percent = parseFloat(parts2[1].trim().replace(/%/g, ""));
                }
              }
              if (parts && parts[1]) {
                result.isCharging = parts[1].trim() === "charging";
                result.acConnected = parts[1].trim() !== "discharging";
              } else {
                result.isCharging =
                  getValue(lines, "ischarging", "=").toLowerCase() === "yes";
                result.acConnected = result.isCharging;
              }
              if (result.maxCapacity && result.currentCapacity) {
                result.hasBattery = true;
                result.type = "Li-ion";
                result.percent =
                  percent !== null
                    ? percent
                    : Math.round(
                        (100.0 * result.currentCapacity) / result.maxCapacity
                      );
                if (!result.isCharging) {
                  result.timeRemaining = parseInt(
                    "0" + getValue(lines, "TimeRemaining", "="),
                    10
                  );
                }
              }
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          }
        );
      }
      if (_sunos) {
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_windows) {
        try {
          const workload = [];
          workload.push(
            powerShell(
              "Get-WmiObject Win32_Battery | select BatteryStatus, DesignCapacity, DesignVoltage, EstimatedChargeRemaining, DeviceID | fl"
            )
          );
          workload.push(
            powerShell(
              "(Get-WmiObject -Class BatteryStaticData -Namespace ROOT/WMI).DesignedCapacity"
            )
          );
          workload.push(
            powerShell(
              "(Get-WmiObject -Class BatteryFullChargedCapacity -Namespace ROOT/WMI).FullChargedCapacity"
            )
          );
          promiseAll(workload).then((data) => {
            if (data) {
              // let parts = data.results[0].split(/\n\s*\n/);
              let parts = data.results[0].split(/\n\s*\n/);
              let batteries = [];
              const hasValue = (value) => /\S/.test(value);
              for (let i = 0; i < parts.length; i++) {
                if (
                  hasValue(parts[i]) &&
                  (!batteries.length || !hasValue(parts[i - 1]))
                ) {
                  batteries.push([]);
                }
                if (hasValue(parts[i])) {
                  batteries[batteries.length - 1].push(parts[i]);
                }
              }
              let designCapacities = data.results[1]
                .split("\r\n")
                .filter((e) => e);
              let fullChargeCapacities = data.results[2]
                .split("\r\n")
                .filter((e) => e);
              if (batteries.length) {
                let first = false;
                let additionalBatteries = [];
                for (let i = 0; i < batteries.length; i++) {
                  let lines = batteries[i][0].split("\r\n");
                  const designedCapacity =
                    designCapacities &&
                    designCapacities.length >= i + 1 &&
                    designCapacities[i]
                      ? toInt(designCapacities[i])
                      : 0;
                  const fullChargeCapacity =
                    fullChargeCapacities &&
                    fullChargeCapacities.length >= i + 1 &&
                    fullChargeCapacities[i]
                      ? toInt(fullChargeCapacities[i])
                      : 0;
                  const parsed = parseWinBatteryPart(
                    lines,
                    designedCapacity,
                    fullChargeCapacity
                  );
                  if (!first && parsed.status > 0 && parsed.status !== 10) {
                    result.hasBattery = parsed.hasBattery;
                    result.maxCapacity = parsed.maxCapacity;
                    result.designedCapacity = parsed.designedCapacity;
                    result.voltage = parsed.voltage;
                    result.capacityUnit = parsed.capacityUnit;
                    result.percent = parsed.percent;
                    result.currentCapacity = parsed.currentCapacity;
                    result.isCharging = parsed.isCharging;
                    result.acConnected = parsed.acConnected;
                    result.model = parsed.model;
                    first = true;
                  } else if (parsed.status !== -1) {
                    additionalBatteries.push({
                      hasBattery: parsed.hasBattery,
                      maxCapacity: parsed.maxCapacity,
                      designedCapacity: parsed.designedCapacity,
                      voltage: parsed.voltage,
                      capacityUnit: parsed.capacityUnit,
                      percent: parsed.percent,
                      currentCapacity: parsed.currentCapacity,
                      isCharging: parsed.isCharging,
                      timeRemaining: null,
                      acConnected: parsed.acConnected,
                      model: parsed.model,
                      type: "",
                      manufacturer: "",
                      serial: "",
                    });
                  }
                }
                if (!first && additionalBatteries.length) {
                  result = additionalBatteries[0];
                  additionalBatteries.shift();
                }
                if (additionalBatteries.length) {
                  result.additionalBatteries = additionalBatteries;
                }
              }
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          });
        } catch (e) {
          if (callback) {
            callback(result);
          }
          resolve(result);
        }
      }
    });
  });
}
