import { existsSync, readFile, readFileSync } from "fs";
import { release, totalmem, arch } from "os";
import {
  promisify,
  getValue,
  noop,
  decodePiCpuinfo,
  powerShell,
  parseDateTime,
  promiseAll,
  toInt,
} from "./util";
import { exec, execSync } from "child_process";
const execPromise = promisify(exec);

let _platform = process.platform;

const _linux = _platform === "linux" || _platform === "android";
const _darwin = _platform === "darwin";
const _windows = _platform === "win32";
const _freebsd = _platform === "freebsd";
const _openbsd = _platform === "openbsd";
const _netbsd = _platform === "netbsd";
const _sunos = _platform === "sunos";

function system(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = {
        manufacturer: "",
        model: "Computer",
        version: "",
        serial: "-",
        uuid: "-",
        sku: "-",
        virtual: false,
      };

      if (_linux || _freebsd || _openbsd || _netbsd) {
        exec(
          "export LC_ALL=C; dmidecode -t system 2>/dev/null; unset LC_ALL",
          function (error, stdout) {
            // if (!error) {
            let lines = stdout.toString().split("\n");
            result.manufacturer = getValue(lines, "manufacturer");
            result.model = getValue(lines, "product name");
            result.version = getValue(lines, "version");
            result.serial = getValue(lines, "serial number");
            result.uuid = getValue(lines, "uuid").toLowerCase();
            result.sku = getValue(lines, "sku number");
            // }
            // Non-Root values
            const cmd = `echo -n "product_name: "; cat /sys/devices/virtual/dmi/id/product_name 2>/dev/null; echo;
            echo -n "product_serial: "; cat /sys/devices/virtual/dmi/id/product_serial 2>/dev/null; echo;
            echo -n "product_uuid: "; cat /sys/devices/virtual/dmi/id/product_uuid 2>/dev/null; echo;
            echo -n "product_version: "; cat /sys/devices/virtual/dmi/id/product_version 2>/dev/null; echo;
            echo -n "sys_vendor: "; cat /sys/devices/virtual/dmi/id/sys_vendor 2>/dev/null; echo;`;
            try {
              lines = execSync(cmd).toString().split("\n");
              result.manufacturer =
                result.manufacturer === ""
                  ? getValue(lines, "sys_vendor")
                  : result.manufacturer;
              result.model =
                result.model === ""
                  ? getValue(lines, "product_name")
                  : result.model;
              result.version =
                result.version === ""
                  ? getValue(lines, "product_version")
                  : result.version;
              result.serial =
                result.serial === ""
                  ? getValue(lines, "product_serial")
                  : result.serial;
              result.uuid =
                result.uuid === ""
                  ? getValue(lines, "product_uuid").toLowerCase()
                  : result.uuid;
            } catch (e) {
              noop();
            }
            if (
              !result.serial ||
              result.serial.toLowerCase().indexOf("o.e.m.") !== -1
            ) {
              result.serial = "-";
            }
            if (
              !result.manufacturer ||
              result.manufacturer.toLowerCase().indexOf("o.e.m.") !== -1
            ) {
              result.manufacturer = "";
            }
            if (
              !result.model ||
              result.model.toLowerCase().indexOf("o.e.m.") !== -1
            ) {
              result.model = "Computer";
            }
            if (
              !result.version ||
              result.version.toLowerCase().indexOf("o.e.m.") !== -1
            ) {
              result.version = "";
            }
            if (
              !result.sku ||
              result.sku.toLowerCase().indexOf("o.e.m.") !== -1
            ) {
              result.sku = "-";
            }

            // detect virtual (1)
            if (
              result.model.toLowerCase() === "virtualbox" ||
              result.model.toLowerCase() === "kvm" ||
              result.model.toLowerCase() === "virtual machine" ||
              result.model.toLowerCase() === "bochs" ||
              result.model.toLowerCase().startsWith("vmware") ||
              result.model.toLowerCase().startsWith("droplet")
            ) {
              result.virtual = true;
              switch (result.model.toLowerCase()) {
                case "virtualbox":
                  result.virtualHost = "VirtualBox";
                  break;
                case "vmware":
                  result.virtualHost = "VMware";
                  break;
                case "kvm":
                  result.virtualHost = "KVM";
                  break;
                case "bochs":
                  result.virtualHost = "bochs";
                  break;
              }
            }
            if (
              result.manufacturer.toLowerCase().startsWith("vmware") ||
              result.manufacturer.toLowerCase() === "xen"
            ) {
              result.virtual = true;
              switch (result.manufacturer.toLowerCase()) {
                case "vmware":
                  result.virtualHost = "VMware";
                  break;
                case "xen":
                  result.virtualHost = "Xen";
                  break;
              }
            }
            if (!result.virtual) {
              try {
                const disksById = execSync(
                  "ls -1 /dev/disk/by-id/ 2>/dev/null"
                ).toString();
                if (disksById.indexOf("_QEMU_") >= 0) {
                  result.virtual = true;
                  result.virtualHost = "QEMU";
                }
                if (disksById.indexOf("_VBOX_") >= 0) {
                  result.virtual = true;
                  result.virtualHost = "VirtualBox";
                }
              } catch (e) {
                noop();
              }
            }
            if (
              !result.virtual &&
              (release().toLowerCase().indexOf("microsoft") >= 0 ||
                release().toLowerCase().endsWith("wsl2"))
            ) {
              const kernelVersion = parseFloat(release().toLowerCase());
              result.virtual = true;
              result.manufacturer = "Microsoft";
              result.model = "WSL";
              result.version = kernelVersion < 4.19 ? "1" : "2";
            }
            if ((_freebsd || _openbsd || _netbsd) && !result.virtualHost) {
              try {
                const procInfo = execSync("dmidecode -t 4");
                const procLines = procInfo.toString().split("\n");
                const procManufacturer = getValue(
                  procLines,
                  "manufacturer",
                  ":",
                  true
                );
                switch (procManufacturer.toLowerCase()) {
                  case "virtualbox":
                    result.virtualHost = "VirtualBox";
                    break;
                  case "vmware":
                    result.virtualHost = "VMware";
                    break;
                  case "kvm":
                    result.virtualHost = "KVM";
                    break;
                  case "bochs":
                    result.virtualHost = "bochs";
                    break;
                }
              } catch (e) {
                noop();
              }
            }
            // detect docker
            if (existsSync("/.dockerenv") || existsSync("/.dockerinit")) {
              result.model = "Docker Container";
            }
            try {
              const stdout = execSync(
                'dmesg 2>/dev/null | grep -iE "virtual|hypervisor" | grep -iE "vmware|qemu|kvm|xen" | grep -viE "Nested Virtualization|/virtual/"'
              );
              // detect virtual machines
              let lines = stdout.toString().split("\n");
              if (lines.length > 0) {
                if (result.model === "Computer") {
                  result.model = "Virtual machine";
                }
                result.virtual = true;
                if (
                  stdout.toString().toLowerCase().indexOf("vmware") >= 0 &&
                  !result.virtualHost
                ) {
                  result.virtualHost = "VMware";
                }
                if (
                  stdout.toString().toLowerCase().indexOf("qemu") >= 0 &&
                  !result.virtualHost
                ) {
                  result.virtualHost = "QEMU";
                }
                if (
                  stdout.toString().toLowerCase().indexOf("xen") >= 0 &&
                  !result.virtualHost
                ) {
                  result.virtualHost = "Xen";
                }
                if (
                  stdout.toString().toLowerCase().indexOf("kvm") >= 0 &&
                  !result.virtualHost
                ) {
                  result.virtualHost = "KVM";
                }
              }
            } catch (e) {
              noop();
            }

            if (
              result.manufacturer === "" &&
              result.model === "Computer" &&
              result.version === ""
            ) {
              // Check Raspberry Pi
              readFile("/proc/cpuinfo", function (error, stdout) {
                if (!error) {
                  let lines = stdout.toString().split("\n");
                  result.model = getValue(
                    lines,
                    "hardware",
                    ":",
                    true
                  ).toUpperCase();
                  result.version = getValue(
                    lines,
                    "revision",
                    ":",
                    true
                  ).toLowerCase();
                  result.serial = getValue(lines, "serial", ":", true);
                  const model = getValue(lines, "model:", ":", true);
                  // reference values: https://elinux.org/RPi_HardwareHistory
                  // https://www.raspberrypi.org/documentation/hardware/raspberrypi/revision-codes/README.md
                  if (
                    (result.model === "BCM2835" ||
                      result.model === "BCM2708" ||
                      result.model === "BCM2709" ||
                      result.model === "BCM2710" ||
                      result.model === "BCM2711" ||
                      result.model === "BCM2836" ||
                      result.model === "BCM2837") &&
                    model.toLowerCase().indexOf("raspberry") >= 0
                  ) {
                    const rPIRevision = decodePiCpuinfo(lines);
                    result.model = rPIRevision.model;
                    result.version = rPIRevision.revisionCode;
                    result.manufacturer = "Raspberry Pi Foundation";
                    result.raspberry = {
                      manufacturer: rPIRevision.manufacturer,
                      processor: rPIRevision.processor,
                      type: rPIRevision.type,
                      revision: rPIRevision.revision,
                    };
                  }

                  // if (result.model === 'BCM2835' || result.model === 'BCM2708' || result.model === 'BCM2709' || result.model === 'BCM2835' || result.model === 'BCM2837') {

                  //   // Pi 4
                  //   if (['d03114'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 4 Model B';
                  //     result.version = result.version + ' - Rev. 1.4';
                  //   }
                  //   if (['b03112', 'c03112'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 4 Model B';
                  //     result.version = result.version + ' - Rev. 1.2';
                  //   }
                  //   if (['a03111', 'b03111', 'c03111'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 4 Model B';
                  //     result.version = result.version + ' - Rev. 1.1';
                  //   }
                  //   // Pi 3
                  //   if (['a02082', 'a22082', 'a32082', 'a52082'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 3 Model B';
                  //     result.version = result.version + ' - Rev. 1.2';
                  //   }
                  //   if (['a22083'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 3 Model B';
                  //     result.version = result.version + ' - Rev. 1.3';
                  //   }
                  //   if (['a020d3'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 3 Model B+';
                  //     result.version = result.version + ' - Rev. 1.3';
                  //   }
                  //   if (['9020e0'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 3 Model A+';
                  //     result.version = result.version + ' - Rev. 1.3';
                  //   }
                  //   // Pi 2 Model B
                  //   if (['a01040'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 2 Model B';
                  //     result.version = result.version + ' - Rev. 1.0';
                  //   }
                  //   if (['a01041', 'a21041'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 2 Model B';
                  //     result.version = result.version + ' - Rev. 1.1';
                  //   }
                  //   if (['a22042', 'a02042'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi 2 Model B';
                  //     result.version = result.version + ' - Rev. 1.2';
                  //   }

                  //   // Compute Model
                  //   if (['a02100'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi CM3+';
                  //     result.version = result.version + ' - Rev 1.0';
                  //   }
                  //   if (['a020a0', 'a220a0'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi CM3';
                  //     result.version = result.version + ' - Rev 1.0';
                  //   }
                  //   if (['900061'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi CM';
                  //     result.version = result.version + ' - Rev 1.1';
                  //   }

                  //   // Pi Zero
                  //   if (['900092', '920092'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Zero';
                  //     result.version = result.version + ' - Rev 1.2';
                  //   }
                  //   if (['900093', '920093'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Zero';
                  //     result.version = result.version + ' - Rev 1.3';
                  //   }
                  //   if (['9000c1'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Zero W';
                  //     result.version = result.version + ' - Rev 1.1';
                  //   }

                  //   // A, B, A+ B+
                  //   if (['0002', '0003'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model B';
                  //     result.version = result.version + ' - Rev 1.0';
                  //   }
                  //   if (['0004', '0005', '0006', '000d', '000e', '000f'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model B';
                  //     result.version = result.version + ' - Rev 2.0';
                  //   }
                  //   if (['0007', '0008', '0009'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model A';
                  //     result.version = result.version + ' - Rev 2.0';
                  //   }
                  //   if (['0010'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model B+';
                  //     result.version = result.version + ' - Rev 1.0';
                  //   }
                  //   if (['0012'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model A+';
                  //     result.version = result.version + ' - Rev 1.0';
                  //   }
                  //   if (['0013', '900032'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model B+';
                  //     result.version = result.version + ' - Rev 1.2';
                  //   }
                  //   if (['0015', '900021'].indexOf(result.version) >= 0) {
                  //     result.model = result.model + ' - Pi Model A+';
                  //     result.version = result.version + ' - Rev 1.1';
                  //   }
                  //   if (result.model.indexOf('Pi') !== -1 && result.version) {  // Pi, Pi Zero
                  //     result.manufacturer = 'Raspberry Pi Foundation';
                  //   }
                  // }
                }
                if (callback) {
                  callback(result);
                }
                resolve(result);
              });
            } else {
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
          }
        );
      }
      if (_darwin) {
        exec("ioreg -c IOPlatformExpertDevice -d 2", function (error, stdout) {
          if (!error) {
            let lines = stdout.toString().replace(/[<>"]/g, "").split("\n");
            result.manufacturer = getValue(lines, "manufacturer", "=", true);
            result.model = getValue(lines, "model", "=", true);
            result.version = getValue(lines, "version", "=", true);
            result.serial = getValue(
              lines,
              "ioplatformserialnumber",
              "=",
              true
            );
            result.uuid = getValue(
              lines,
              "ioplatformuuid",
              "=",
              true
            ).toLowerCase();
            result.sku = getValue(lines, "board-id", "=", true);
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_sunos) {
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_windows) {
        try {
          powerShell(
            "Get-WmiObject Win32_ComputerSystemProduct | select Name,Vendor,Version,IdentifyingNumber,UUID | fl"
          ).then((stdout, error) => {
            if (!error) {
              // let lines = stdout.split('\r\n').filter(line => line.trim() !== '').filter((line, idx) => idx > 0)[0].trim().split(/\s\s+/);
              let lines = stdout.split("\r\n");
              result.manufacturer = getValue(lines, "vendor", ":");
              result.model = getValue(lines, "name", ":");
              result.version = getValue(lines, "version", ":");
              result.serial = getValue(lines, "identifyingnumber", ":");
              result.uuid = getValue(lines, "uuid", ":").toLowerCase();
              // detect virtual (1)
              const model = result.model.toLowerCase();
              if (
                model === "virtualbox" ||
                model === "kvm" ||
                model === "virtual machine" ||
                model === "bochs" ||
                model.startsWith("vmware") ||
                model.startsWith("qemu")
              ) {
                result.virtual = true;
                if (model.startsWith("virtualbox")) {
                  result.virtualHost = "VirtualBox";
                }
                if (model.startsWith("vmware")) {
                  result.virtualHost = "VMware";
                }
                if (model.startsWith("kvm")) {
                  result.virtualHost = "KVM";
                }
                if (model.startsWith("bochs")) {
                  result.virtualHost = "bochs";
                }
                if (model.startsWith("qemu")) {
                  result.virtualHost = "KVM";
                }
              }
              const manufacturer = result.manufacturer.toLowerCase();
              if (
                manufacturer.startsWith("vmware") ||
                manufacturer.startsWith("qemu") ||
                manufacturer === "xen"
              ) {
                result.virtual = true;
                if (manufacturer.startsWith("vmware")) {
                  result.virtualHost = "VMware";
                }
                if (manufacturer.startsWith("xen")) {
                  result.virtualHost = "Xen";
                }
                if (manufacturer.startsWith("qemu")) {
                  result.virtualHost = "KVM";
                }
              }
              powerShell(
                'Get-WmiObject MS_Systeminformation -Namespace "root/wmi" | select systemsku | fl '
              ).then((stdout, error) => {
                if (!error) {
                  let lines = stdout.split("\r\n");
                  result.sku = getValue(lines, "systemsku", ":");
                }
                if (!result.virtual) {
                  powerShell(
                    "Get-WmiObject Win32_bios | select Version, SerialNumber, SMBIOSBIOSVersion"
                  ).then((stdout, error) => {
                    if (!error) {
                      let lines = stdout.toString();
                      if (
                        lines.indexOf("VRTUAL") >= 0 ||
                        lines.indexOf("A M I ") >= 0 ||
                        lines.indexOf("VirtualBox") >= 0 ||
                        lines.indexOf("VMWare") >= 0 ||
                        lines.indexOf("Xen") >= 0
                      ) {
                        result.virtual = true;
                        if (
                          lines.indexOf("VirtualBox") >= 0 &&
                          !result.virtualHost
                        ) {
                          result.virtualHost = "VirtualBox";
                        }
                        if (
                          lines.indexOf("VMware") >= 0 &&
                          !result.virtualHost
                        ) {
                          result.virtualHost = "VMware";
                        }
                        if (lines.indexOf("Xen") >= 0 && !result.virtualHost) {
                          result.virtualHost = "Xen";
                        }
                        if (
                          lines.indexOf("VRTUAL") >= 0 &&
                          !result.virtualHost
                        ) {
                          result.virtualHost = "Hyper-V";
                        }
                        if (
                          lines.indexOf("A M I") >= 0 &&
                          !result.virtualHost
                        ) {
                          result.virtualHost = "Virtual PC";
                        }
                      }
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
              });
            } else {
              if (callback) {
                callback(result);
              }
              resolve(result);
            }
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

const _system = system;
export { _system as system };

function bios(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = {
        vendor: "",
        version: "",
        releaseDate: "",
        revision: "",
      };
      let cmd = "";
      if (_linux || _freebsd || _openbsd || _netbsd) {
        if (process.arch === "arm") {
          cmd = "cat /proc/cpuinfo | grep Serial";
        } else {
          cmd = "export LC_ALL=C; dmidecode -t bios 2>/dev/null; unset LC_ALL";
        }
        exec(cmd, function (error, stdout) {
          let lines = stdout.toString().split("\n");
          result.vendor = getValue(lines, "Vendor");
          result.version = getValue(lines, "Version");
          let datetime = getValue(lines, "Release Date");
          result.releaseDate = parseDateTime(datetime).date;
          result.revision = getValue(lines, "BIOS Revision");
          result.serial = getValue(lines, "SerialNumber");
          let language = getValue(lines, "Currently Installed Language").split(
            "|"
          )[0];
          if (language) {
            result.language = language;
          }
          if (
            lines.length &&
            stdout.toString().indexOf("Characteristics:") >= 0
          ) {
            const features = [];
            lines.forEach((line) => {
              if (line.indexOf(" is supported") >= 0) {
                const feature = line.split(" is supported")[0].trim();
                features.push(feature);
              }
            });
            result.features = features;
          }
          // Non-Root values
          const cmd = `echo -n "bios_date: "; cat /sys/devices/virtual/dmi/id/bios_date 2>/dev/null; echo;
            echo -n "bios_vendor: "; cat /sys/devices/virtual/dmi/id/bios_vendor 2>/dev/null; echo;
            echo -n "bios_version: "; cat /sys/devices/virtual/dmi/id/bios_version 2>/dev/null; echo;`;
          try {
            lines = execSync(cmd).toString().split("\n");
            result.vendor = !result.vendor
              ? getValue(lines, "bios_vendor")
              : result.vendor;
            result.version = !result.version
              ? getValue(lines, "bios_version")
              : result.version;
            datetime = getValue(lines, "bios_date");
            result.releaseDate = !result.releaseDate
              ? parseDateTime(datetime).date
              : result.releaseDate;
          } catch (e) {
            noop();
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_darwin) {
        result.vendor = "Apple Inc.";
        exec(
          "system_profiler SPHardwareDataType -json",
          function (error, stdout) {
            try {
              const hardwareData = JSON.parse(stdout.toString());
              if (
                hardwareData &&
                hardwareData.SPHardwareDataType &&
                hardwareData.SPHardwareDataType.length
              ) {
                let bootRomVersion =
                  hardwareData.SPHardwareDataType[0].boot_rom_version;
                bootRomVersion = bootRomVersion
                  ? bootRomVersion.split("(")[0].trim()
                  : null;
                result.version = bootRomVersion;
              }
            } catch (e) {
              noop();
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          }
        );
      }
      if (_sunos) {
        result.vendor = "Sun Microsystems";
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_windows) {
        try {
          powerShell(
            "Get-WmiObject Win32_bios | select Description,Version,Manufacturer,ReleaseDate,BuildNumber,SerialNumber | fl"
          ).then((stdout, error) => {
            if (!error) {
              let lines = stdout.toString().split("\r\n");
              const description = getValue(lines, "description", ":");
              if (description.indexOf(" Version ") !== -1) {
                // ... Phoenix ROM BIOS PLUS Version 1.10 A04
                result.vendor = description.split(" Version ")[0].trim();
                result.version = description.split(" Version ")[1].trim();
              } else if (description.indexOf(" Ver: ") !== -1) {
                // ... BIOS Date: 06/27/16 17:50:16 Ver: 1.4.5
                result.vendor = getValue(lines, "manufacturer", ":");
                result.version = description.split(" Ver: ")[1].trim();
              } else {
                result.vendor = getValue(lines, "manufacturer", ":");
                result.version = getValue(lines, "version", ":");
              }
              result.releaseDate = getValue(lines, "releasedate", ":");
              if (result.releaseDate.length >= 10) {
                result.releaseDate =
                  result.releaseDate.substr(0, 4) +
                  "-" +
                  result.releaseDate.substr(4, 2) +
                  "-" +
                  result.releaseDate.substr(6, 2);
              }
              result.revision = getValue(lines, "buildnumber", ":");
              result.serial = getValue(lines, "serialnumber", ":");
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

const _bios = bios;
export { _bios as bios };

function baseboard(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = {
        manufacturer: "",
        model: "",
        version: "",
        serial: "-",
        assetTag: "-",
        memMax: null,
        memSlots: null,
      };
      let cmd = "";
      if (_linux || _freebsd || _openbsd || _netbsd) {
        if (process.arch === "arm") {
          cmd = "cat /proc/cpuinfo | grep Serial";
          // 'BCM2709', 'BCM2835', 'BCM2708' -->
        } else {
          cmd = "export LC_ALL=C; dmidecode -t 2 2>/dev/null; unset LC_ALL";
        }
        const workload = [];
        workload.push(execPromise(cmd));
        workload.push(
          execPromise("export LC_ALL=C; dmidecode -t memory 2>/dev/null")
        );
        promiseAll(workload).then((data) => {
          let lines = data.results[0]
            ? data.results[0].toString().split("\n")
            : [""];
          result.manufacturer = getValue(lines, "Manufacturer");
          result.model = getValue(lines, "Product Name");
          result.version = getValue(lines, "Version");
          result.serial = getValue(lines, "Serial Number");
          result.assetTag = getValue(lines, "Asset Tag");
          // Non-Root values
          const cmd = `echo -n "board_asset_tag: "; cat /sys/devices/virtual/dmi/id/board_asset_tag 2>/dev/null; echo;
            echo -n "board_name: "; cat /sys/devices/virtual/dmi/id/board_name 2>/dev/null; echo;
            echo -n "board_serial: "; cat /sys/devices/virtual/dmi/id/board_serial 2>/dev/null; echo;
            echo -n "board_vendor: "; cat /sys/devices/virtual/dmi/id/board_vendor 2>/dev/null; echo;
            echo -n "board_version: "; cat /sys/devices/virtual/dmi/id/board_version 2>/dev/null; echo;`;
          try {
            lines = execSync(cmd).toString().split("\n");
            result.manufacturer = !result.manufacturer
              ? getValue(lines, "board_vendor")
              : result.manufacturer;
            result.model = !result.model
              ? getValue(lines, "board_name")
              : result.model;
            result.version = !result.version
              ? getValue(lines, "board_version")
              : result.version;
            result.serial = !result.serial
              ? getValue(lines, "board_serial")
              : result.serial;
            result.assetTag = !result.assetTag
              ? getValue(lines, "board_asset_tag")
              : result.assetTag;
          } catch (e) {
            noop();
          }
          if (result.serial.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.serial = "-";
          }
          if (result.assetTag.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.assetTag = "-";
          }

          // mem
          lines = data.results[1]
            ? data.results[1].toString().split("\n")
            : [""];
          result.memMax =
            toInt(getValue(lines, "Maximum Capacity")) * 1024 * 1024 * 1024 ||
            null;
          result.memSlots = toInt(getValue(lines, "Number Of Devices")) || null;

          // raspberry
          let linesRpi = "";
          try {
            linesRpi = readFileSync("/proc/cpuinfo").toString().split("\n");
          } catch (e) {
            noop();
          }
          const hardware = getValue(linesRpi, "hardware");
          if (hardware.startsWith("BCM")) {
            const rpi = decodePiCpuinfo(linesRpi);
            result.manufacturer = rpi.manufacturer;
            result.model = "Raspberry Pi";
            result.serial = rpi.serial;
            result.version = rpi.type + " - " + rpi.revision;
            result.memMax = totalmem();
            result.memSlots = 0;
          }

          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_darwin) {
        const workload = [];
        workload.push(execPromise("ioreg -c IOPlatformExpertDevice -d 2"));
        workload.push(execPromise("system_profiler SPMemoryDataType"));
        promiseAll(workload).then((data) => {
          let lines = data.results[0]
            ? data.results[0].toString().replace(/[<>"]/g, "").split("\n")
            : [""];
          result.manufacturer = getValue(lines, "manufacturer", "=", true);
          result.model = getValue(lines, "model", "=", true);
          result.version = getValue(lines, "version", "=", true);
          result.serial = getValue(lines, "ioplatformserialnumber", "=", true);
          result.assetTag = getValue(lines, "board-id", "=", true);

          // mem
          let devices = data.results[1]
            ? data.results[1].toString().split("        BANK ")
            : [""];
          if (devices.length === 1) {
            devices = data.results[1]
              ? data.results[1].toString().split("        DIMM")
              : [""];
          }
          devices.shift();
          result.memSlots = devices.length;

          if (arch() === "arm64") {
            result.memSlots = 0;
            result.memMax = totalmem();
          }

          if (callback) {
            callback(result);
          }
          resolve(result);
        });
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
              "Get-WmiObject Win32_baseboard | select Model,Manufacturer,Product,Version,SerialNumber,PartNumber,SKU | fl"
            )
          );
          workload.push(
            powerShell(
              "Get-WmiObject Win32_physicalmemoryarray | select MaxCapacity, MemoryDevices | fl"
            )
          );
          promiseAll(workload).then((data) => {
            let lines = data.results[0]
              ? data.results[0].toString().split("\r\n")
              : [""];

            result.manufacturer = getValue(lines, "manufacturer", ":");
            result.model = getValue(lines, "model", ":");
            if (!result.model) {
              result.model = getValue(lines, "product", ":");
            }
            result.version = getValue(lines, "version", ":");
            result.serial = getValue(lines, "serialnumber", ":");
            result.assetTag = getValue(lines, "partnumber", ":");
            if (!result.assetTag) {
              result.assetTag = getValue(lines, "sku", ":");
            }

            // memphysical
            lines = data.results[1]
              ? data.results[1].toString().split("\r\n")
              : [""];
            result.memMax = toInt(getValue(lines, "MaxCapacity", ":")) || null;
            result.memSlots =
              toInt(getValue(lines, "MemoryDevices", ":")) || null;

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

const _baseboard = baseboard;
export { _baseboard as baseboard };

function chassis(callback) {
  const chassisTypes = [
    "Other",
    "Unknown",
    "Desktop",
    "Low Profile Desktop",
    "Pizza Box",
    "Mini Tower",
    "Tower",
    "Portable",
    "Laptop",
    "Notebook",
    "Hand Held",
    "Docking Station",
    "All in One",
    "Sub Notebook",
    "Space-Saving",
    "Lunch Box",
    "Main System Chassis",
    "Expansion Chassis",
    "SubChassis",
    "Bus Expansion Chassis",
    "Peripheral Chassis",
    "Storage Chassis",
    "Rack Mount Chassis",
    "Sealed-Case PC",
    "Multi-System Chassis",
    "Compact PCI",
    "Advanced TCA",
    "Blade",
    "Blade Enclosure",
    "Tablet",
    "Convertible",
    "Detachable",
    "IoT Gateway ",
    "Embedded PC",
    "Mini PC",
    "Stick PC",
  ];

  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = {
        manufacturer: "",
        model: "",
        type: "",
        version: "",
        serial: "-",
        assetTag: "-",
        sku: "",
      };
      if (_linux || _freebsd || _openbsd || _netbsd) {
        const cmd = `echo -n "chassis_asset_tag: "; cat /sys/devices/virtual/dmi/id/chassis_asset_tag 2>/dev/null; echo;
            echo -n "chassis_serial: "; cat /sys/devices/virtual/dmi/id/chassis_serial 2>/dev/null; echo;
            echo -n "chassis_type: "; cat /sys/devices/virtual/dmi/id/chassis_type 2>/dev/null; echo;
            echo -n "chassis_vendor: "; cat /sys/devices/virtual/dmi/id/chassis_vendor 2>/dev/null; echo;
            echo -n "chassis_version: "; cat /sys/devices/virtual/dmi/id/chassis_version 2>/dev/null; echo;`;
        exec(cmd, function (error, stdout) {
          let lines = stdout.toString().split("\n");
          result.manufacturer = getValue(lines, "chassis_vendor");
          const ctype = parseInt(
            getValue(lines, "chassis_type").replace(/\D/g, "")
          );
          result.type =
            ctype && !isNaN(ctype) && ctype < chassisTypes.length
              ? chassisTypes[ctype - 1]
              : "";
          result.version = getValue(lines, "chassis_version");
          result.serial = getValue(lines, "chassis_serial");
          result.assetTag = getValue(lines, "chassis_asset_tag");
          if (result.manufacturer.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.manufacturer = "-";
          }
          if (result.version.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.version = "-";
          }
          if (result.serial.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.serial = "-";
          }
          if (result.assetTag.toLowerCase().indexOf("o.e.m.") !== -1) {
            result.assetTag = "-";
          }

          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_darwin) {
        exec("ioreg -c IOPlatformExpertDevice -d 2", function (error, stdout) {
          if (!error) {
            let lines = stdout.toString().replace(/[<>"]/g, "").split("\n");
            result.manufacturer = getValue(lines, "manufacturer", "=", true);
            result.model = getValue(lines, "model", "=", true);
            result.version = getValue(lines, "version", "=", true);
            result.serial = getValue(
              lines,
              "ioplatformserialnumber",
              "=",
              true
            );
            result.assetTag = getValue(lines, "board-id", "=", true);
          }

          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_sunos) {
        if (callback) {
          callback(result);
        }
        resolve(result);
      }
      if (_windows) {
        try {
          powerShell(
            "Get-WmiObject Win32_SystemEnclosure | select Model,Manufacturer,ChassisTypes,Version,SerialNumber,PartNumber,SKU | fl"
          ).then((stdout, error) => {
            if (!error) {
              let lines = stdout.toString().split("\r\n");

              result.manufacturer = getValue(lines, "manufacturer", ":");
              result.model = getValue(lines, "model", ":");
              const ctype = parseInt(
                getValue(lines, "ChassisTypes", ":").replace(/\D/g, "")
              );
              result.type =
                ctype && !isNaN(ctype) && ctype < chassisTypes.length
                  ? chassisTypes[ctype - 1]
                  : "";
              result.version = getValue(lines, "version", ":");
              result.serial = getValue(lines, "serialnumber", ":");
              result.assetTag = getValue(lines, "partnumber", ":");
              result.sku = getValue(lines, "sku", ":");
              if (result.manufacturer.toLowerCase().indexOf("o.e.m.") !== -1) {
                result.manufacturer = "-";
              }
              if (result.version.toLowerCase().indexOf("o.e.m.") !== -1) {
                result.version = "-";
              }
              if (result.serial.toLowerCase().indexOf("o.e.m.") !== -1) {
                result.serial = "-";
              }
              if (result.assetTag.toLowerCase().indexOf("o.e.m.") !== -1) {
                result.assetTag = "-";
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

const _chassis = chassis;
export { _chassis as chassis };
