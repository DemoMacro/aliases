import * as util from "./util";
import * as systemImport from "./system";
import * as osInfoImport from "./osinfo";
import * as cpuImport from "./cpu";
import * as memoryImport from "./memory";
import * as batteryImport from "./battery";
import * as graphicsImport from "./graphics";
import * as filesystem from "./filesystem";
import * as network from "./network";
import * as wifi from "./wifi";
import * as processesImport from "./processes";
import * as usersImport from "./users";
import * as internet from "./internet";
import * as docker from "./docker";
import * as vbox from "./virtualbox";
import * as printerImport from "./printer";
import * as usbImport from "./usb";
import * as audioImport from "./audio";
import * as bluetooth from "./bluetooth";
import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

let _platform = process.platform;
const _windows = _platform === "win32";
const _freebsd = _platform === "freebsd";
const _openbsd = _platform === "openbsd";
const _netbsd = _platform === "netbsd";
const _sunos = _platform === "sunos";

// ----------------------------------------------------------------------------------
// init
// ----------------------------------------------------------------------------------

if (_windows) {
  util.getCodepage();
}

// ----------------------------------------------------------------------------------
// General
// ----------------------------------------------------------------------------------

export function version() {
  const moduleDir = fileURLToPath(new URL("../", import.meta.url));
  const { version } = JSON.parse(
    readFileSync(resolve(moduleDir, "package.json"), "utf8")
  );
  return version;
}

// ----------------------------------------------------------------------------------
// Get static and dynamic data (all)
// ----------------------------------------------------------------------------------

// --------------------------
// get static data - they should not change until restarted

export function getStaticData(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let data = {};

      data.version = version();

      Promise.all([
        systemImport.system(),
        systemImport.bios(),
        systemImport.baseboard(),
        systemImport.chassis(),
        osInfoImport.osInfo(),
        osInfoImport.uuid(),
        osInfoImport.versions(),
        cpuImport.cpu(),
        cpuImport.cpuFlags(),
        graphics.graphics(),
        network.networkInterfaces(),
        memoryImport.memLayout(),
        filesystem.diskLayout(),
      ]).then((res) => {
        data.system = res[0];
        data.bios = res[1];
        data.baseboard = res[2];
        data.chassis = res[3];
        data.os = res[4];
        data.uuid = res[5];
        data.versions = res[6];
        data.cpu = res[7];
        data.cpu.flags = res[8];
        data.graphics = res[9];
        data.net = res[10];
        data.memLayout = res[11];
        data.diskLayout = res[12];
        if (callback) {
          callback(data);
        }
        resolve(data);
      });
    });
  });
}

// --------------------------
// get all dynamic data - e.g. for monitoring agents
// may take some seconds to get all data
// --------------------------
// 2 additional parameters needed
// - srv: 		comma separated list of services to monitor e.g. "mysql, apache, postgresql"
// - iface:	define network interface for which you like to monitor network speed e.g. "eth0"

export function getDynamicData(srv, iface, callback) {
  if (util.isFunction(iface)) {
    callback = iface;
    iface = "";
  }
  if (util.isFunction(srv)) {
    callback = srv;
    srv = "";
  }

  return new Promise((resolve) => {
    process.nextTick(() => {
      iface = iface || network.getDefaultNetworkInterface();
      srv = srv || "";

      // use closure to track ƒ completion
      let functionProcessed = (function () {
        let totalFunctions = 15;
        if (_windows) {
          totalFunctions = 13;
        }
        if (_freebsd || _openbsd || _netbsd) {
          totalFunctions = 11;
        }
        if (_sunos) {
          totalFunctions = 6;
        }

        return function () {
          if (--totalFunctions === 0) {
            if (callback) {
              callback(data);
            }
            resolve(data);
          }
        };
      })();

      // var totalFunctions = 14;
      // function functionProcessed() {
      //   if (--totalFunctions === 0) {
      //     if (callback) { callback(data) }
      //     resolve(data);
      //   }
      // }

      let data = {};

      // get time
      data.time = osInfoImport.time();

      /**
       * @namespace
       * @property {Object}  versions
       * @property {string}  versions.node
       * @property {string}  versions.v8
       */
      data.node = process.versions.node;
      data.v8 = process.versions.v8;

      cpuImport.cpuCurrentSpeed().then((res) => {
        data.cpuCurrentSpeed = res;
        functionProcessed();
      });

      users.users().then((res) => {
        data.users = res;
        functionProcessed();
      });

      processesImport.processes().then((res) => {
        data.processes = res;
        functionProcessed();
      });

      cpuImport.currentLoad().then((res) => {
        data.currentLoad = res;
        functionProcessed();
      });

      if (!_sunos) {
        cpuImport.cpuTemperature().then((res) => {
          data.temp = res;
          functionProcessed();
        });
      }

      if (!_openbsd && !_freebsd && !_netbsd && !_sunos) {
        network.networkStats(iface).then((res) => {
          data.networkStats = res;
          functionProcessed();
        });
      }

      if (!_sunos) {
        network.networkConnections().then((res) => {
          data.networkConnections = res;
          functionProcessed();
        });
      }

      memoryImport.mem().then((res) => {
        data.mem = res;
        functionProcessed();
      });

      if (!_sunos) {
        battery().then((res) => {
          data.battery = res;
          functionProcessed();
        });
      }

      if (!_sunos) {
        processesImport.services(srv).then((res) => {
          data.services = res;
          functionProcessed();
        });
      }

      if (!_sunos) {
        filesystem.fsSize().then((res) => {
          data.fsSize = res;
          functionProcessed();
        });
      }

      if (!_windows && !_openbsd && !_freebsd && !_netbsd && !_sunos) {
        filesystem.fsStats().then((res) => {
          data.fsStats = res;
          functionProcessed();
        });
      }

      if (!_windows && !_openbsd && !_freebsd && !_netbsd && !_sunos) {
        filesystem.disksIO().then((res) => {
          data.disksIO = res;
          functionProcessed();
        });
      }

      if (!_openbsd && !_freebsd && !_netbsd && !_sunos) {
        wifi.wifiNetworks().then((res) => {
          data.wifiNetworks = res;
          functionProcessed();
        });
      }

      internet.inetLatency().then((res) => {
        data.inetLatency = res;
        functionProcessed();
      });
    });
  });
}

// --------------------------
// get all data at once
// --------------------------
// 2 additional parameters needed
// - srv: 		comma separated list of services to monitor e.g. "mysql, apache, postgresql"
// - iface:	define network interface for which you like to monitor network speed e.g. "eth0"

export function getAllData(srv, iface, callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let data = {};

      if (iface && util.isFunction(iface) && !callback) {
        callback = iface;
        iface = "";
      }

      if (srv && util.isFunction(srv) && !iface && !callback) {
        callback = srv;
        srv = "";
        iface = "";
      }

      getStaticData().then((res) => {
        data = res;
        getDynamicData(srv, iface).then((res) => {
          for (let key in res) {
            if ({}.hasOwnProperty.call(res, key)) {
              data[key] = res[key];
            }
          }
          if (callback) {
            callback(data);
          }
          resolve(data);
        });
      });
    });
  });
}

export function get(valueObject, callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      const allPromises = Object.keys(valueObject)
        .filter((func) => ({}.hasOwnProperty.call(defaultExport, func)))
        .map((func) => {
          const params = valueObject[func].substring(
            valueObject[func].lastIndexOf("(") + 1,
            valueObject[func].lastIndexOf(")")
          );
          let funcWithoutParams =
            func.indexOf(")") >= 0 ? func.split(")")[1].trim() : func;
          funcWithoutParams =
            func.indexOf("|") >= 0
              ? func.split("|")[0].trim()
              : funcWithoutParams;
          if (params) {
            return defaultExport[funcWithoutParams](params);
          } else {
            return defaultExport[funcWithoutParams]("");
          }
        });

      Promise.all(allPromises).then((data) => {
        const result = {};
        let i = 0;
        for (let key in valueObject) {
          if (
            {}.hasOwnProperty.call(valueObject, key) &&
            {}.hasOwnProperty.call(defaultExport, key) &&
            data.length > i
          ) {
            if (valueObject[key] === "*" || valueObject[key] === "all") {
              result[key] = data[i];
            } else {
              let keys = valueObject[key];
              // let params = '';
              let filter = "";
              let filterParts = [];
              // remove params
              if (keys.indexOf(")") >= 0) {
                keys = keys.split(")")[1].trim();
              }
              // extract filter and remove it from keys
              if (keys.indexOf("|") >= 0) {
                filter = keys.split("|")[1].trim();
                filterParts = filter.split(":");

                keys = keys.split("|")[0].trim();
              }
              keys = keys.replace(/,/g, " ").replace(/ +/g, " ").split(" ");
              if (data[i]) {
                if (Array.isArray(data[i])) {
                  // result is in an array, go through all elements of array and pick only the right ones
                  const partialArray = [];
                  data[i].forEach((element) => {
                    let partialRes = {};
                    if (
                      keys.length === 1 &&
                      (keys[0] === "*" || keys[0] === "all")
                    ) {
                      partialRes = element;
                    } else {
                      keys.forEach((k) => {
                        if ({}.hasOwnProperty.call(element, k)) {
                          partialRes[k] = element[k];
                        }
                      });
                    }
                    // if there is a filter, then just take those elements
                    if (filter && filterParts.length === 2) {
                      if (
                        {}.hasOwnProperty.call(
                          partialRes,
                          filterParts[0].trim()
                        )
                      ) {
                        const val = partialRes[filterParts[0].trim()];
                        if (typeof val == "number") {
                          if (val === parseFloat(filterParts[1].trim())) {
                            partialArray.push(partialRes);
                          }
                        } else if (typeof val == "string") {
                          if (
                            val.toLowerCase() ===
                            filterParts[1].trim().toLowerCase()
                          ) {
                            partialArray.push(partialRes);
                          }
                        }
                      }
                    } else {
                      partialArray.push(partialRes);
                    }
                  });
                  result[key] = partialArray;
                } else {
                  const partialRes = {};
                  keys.forEach((k) => {
                    if ({}.hasOwnProperty.call(data[i], k)) {
                      partialRes[k] = data[i][k];
                    }
                  });
                  result[key] = partialRes;
                }
              } else {
                result[key] = {};
              }
            }
            i++;
          }
        }
        if (callback) {
          callback(result);
        }
        resolve(result);
      });
    });
  });
}

export function observe(valueObject, interval, callback) {
  let _data = null;

  const result = setInterval(() => {
    get(valueObject).then((data) => {
      if (JSON.stringify(_data) !== JSON.stringify(data)) {
        _data = Object.assign({}, data);
        callback(data);
      }
    });
  }, interval);
  return result;
}

// ----------------------------------------------------------------------------------
// export all libs
// ----------------------------------------------------------------------------------

export const system = systemImport.system;
export const bios = systemImport.bios;
export const baseboard = systemImport.baseboard;
export const chassis = systemImport.chassis;

export const time = osInfoImport.time;
export const osInfo = osInfoImport.osInfo;
export const versions = osInfoImport.versions;
export const shell = osInfoImport.shell;
export const uuid = osInfoImport.uuid;

export const cpu = cpuImport.cpu;
export const cpuFlags = cpuImport.cpuFlags;
export const cpuCache = cpuImport.cpuCache;
export const cpuCurrentSpeed = cpuImport.cpuCurrentSpeed;
export const cpuTemperature = cpuImport.cpuTemperature;
export const currentLoad = cpuImport.currentLoad;
export const fullLoad = cpuImport.fullLoad;

export const mem = memoryImport.mem;
export const memLayout = memoryImport.memLayout;

export const battery = batteryImport;

export const graphics = graphicsImport.graphics;

export const fsSize = filesystem.fsSize;
export const fsOpenFiles = filesystem.fsOpenFiles;
export const blockDevices = filesystem.blockDevices;
export const fsStats = filesystem.fsStats;
export const disksIO = filesystem.disksIO;
export const diskLayout = filesystem.diskLayout;

export const networkInterfaceDefault = network.networkInterfaceDefault;
export const networkGatewayDefault = network.networkGatewayDefault;
export const networkInterfaces = network.networkInterfaces;
export const networkStats = network.networkStats;
export const networkConnections = network.networkConnections;

export const wifiNetworks = wifi.wifiNetworks;
export const wifiInterfaces = wifi.wifiInterfaces;
export const wifiConnections = wifi.wifiConnections;

export const services = processesImport.services;
export const processes = processesImport.processes;
export const processLoad = processesImport.processLoad;

export const users = usersImport.users;

export const inetChecksite = internet.inetChecksite;
export const inetLatency = internet.inetLatency;

export const dockerInfo = docker.dockerInfo;
export const dockerImages = docker.dockerImages;
export const dockerContainers = docker.dockerContainers;
export const dockerContainerStats = docker.dockerContainerStats;
export const dockerContainerProcesses = docker.dockerContainerProcesses;
export const dockerVolumes = docker.dockerVolumes;
export const dockerAll = docker.dockerAll;

export const vboxInfo = vbox.vboxInfo;

export const printer = printerImport.printer;

export const usb = usbImport.usb;

export const audio = audioImport.audio;
export const bluetoothDevices = bluetooth.bluetoothDevices;

export const powerShellStart = util.powerShellStart;
export const powerShellRelease = util.powerShellRelease;

const defaultExport = {
  audio,
  baseboard,
  battery,
  bios,
  blockDevices,
  bluetoothDevices,
  chassis,
  cpu,
  cpuCache,
  cpuCurrentSpeed,
  cpuFlags,
  cpuTemperature,
  currentLoad,
  diskLayout,
  disksIO,
  dockerAll,
  dockerContainerProcesses,
  dockerContainerStats,
  dockerContainers,
  dockerImages,
  dockerInfo,
  dockerVolumes,
  fsOpenFiles,
  fsSize,
  fsStats,
  fullLoad,
  get,
  getAllData,
  getDynamicData,
  getStaticData,
  graphics,
  inetChecksite,
  inetLatency,
  mem,
  memLayout,
  networkConnections,
  networkGatewayDefault,
  networkInterfaceDefault,
  networkInterfaces,
  networkStats,
  observe,
  osInfo,
  powerShellRelease,
  powerShellStart,
  printer,
  processLoad,
  processes,
  services,
  shell,
  system,
  time,
  usb,
  users,
  uuid,
  vboxInfo,
  version,
  versions,
  wifiConnections,
  wifiInterfaces,
  wifiNetworks,
};
