import { EOL } from "os";
import { exec } from "child_process";
import { getVboxmanage, getValue, noop } from "./util";

function vboxInfo(callback) {
  // fallback - if only callback is given
  let result = [];
  return new Promise((resolve) => {
    process.nextTick(() => {
      try {
        exec(getVboxmanage() + " list vms --long", function (error, stdout) {
          let parts = (EOL + stdout.toString()).split(EOL + "Name:");
          parts.shift();
          parts.forEach((part) => {
            const lines = ("Name:" + part).split(EOL);
            const state = getValue(lines, "State");
            const running = state.startsWith("running");
            const runningSinceString = running
              ? state.replace("running (since ", "").replace(")", "").trim()
              : "";
            let runningSince = 0;
            try {
              if (running) {
                const sinceDateObj = new Date(runningSinceString);
                const offset = sinceDateObj.getTimezoneOffset();
                runningSince =
                  Math.round((Date.now() - Date.parse(sinceDateObj)) / 1000) +
                  offset * 60;
              }
            } catch (e) {
              noop();
            }
            const stoppedSinceString = !running
              ? state.replace("powered off (since", "").replace(")", "").trim()
              : "";
            let stoppedSince = 0;
            try {
              if (!running) {
                const sinceDateObj = new Date(stoppedSinceString);
                const offset = sinceDateObj.getTimezoneOffset();
                stoppedSince =
                  Math.round((Date.now() - Date.parse(sinceDateObj)) / 1000) +
                  offset * 60;
              }
            } catch (e) {
              noop();
            }
            result.push({
              id: getValue(lines, "UUID"),
              name: getValue(lines, "Name"),
              running,
              started: runningSinceString,
              runningSince,
              stopped: stoppedSinceString,
              stoppedSince,
              guestOS: getValue(lines, "Guest OS"),
              hardwareUUID: getValue(lines, "Hardware UUID"),
              memory: parseInt(getValue(lines, "Memory size", "     "), 10),
              vram: parseInt(getValue(lines, "VRAM size"), 10),
              cpus: parseInt(getValue(lines, "Number of CPUs"), 10),
              cpuExepCap: getValue(lines, "CPU exec cap"),
              cpuProfile: getValue(lines, "CPUProfile"),
              chipset: getValue(lines, "Chipset"),
              firmware: getValue(lines, "Firmware"),
              pageFusion: getValue(lines, "Page Fusion") === "enabled",
              configFile: getValue(lines, "Config file"),
              snapshotFolder: getValue(lines, "Snapshot folder"),
              logFolder: getValue(lines, "Log folder"),
              hpet: getValue(lines, "HPET") === "enabled",
              pae: getValue(lines, "PAE") === "enabled",
              longMode: getValue(lines, "Long Mode") === "enabled",
              tripleFaultReset:
                getValue(lines, "Triple Fault Reset") === "enabled",
              apic: getValue(lines, "APIC") === "enabled",
              x2Apic: getValue(lines, "X2APIC") === "enabled",
              acpi: getValue(lines, "ACPI") === "enabled",
              ioApic: getValue(lines, "IOAPIC") === "enabled",
              biosApicMode: getValue(lines, "BIOS APIC mode"),
              bootMenuMode: getValue(lines, "Boot menu mode"),
              bootDevice1: getValue(lines, "Boot Device 1"),
              bootDevice2: getValue(lines, "Boot Device 2"),
              bootDevice3: getValue(lines, "Boot Device 3"),
              bootDevice4: getValue(lines, "Boot Device 4"),
              timeOffset: getValue(lines, "Time offset"),
              rtc: getValue(lines, "RTC"),
            });
          });

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
    });
  });
}

const _vboxInfo = vboxInfo;
export { _vboxInfo as vboxInfo };
