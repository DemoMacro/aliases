import { exec } from "child_process";
// const execSync = require('child_process').execSync;
import { getValue, noop, powerShell } from "./util";
// const fs = require('fs');

let _platform = process.platform;

const _linux = _platform === "linux" || _platform === "android";
const _darwin = _platform === "darwin";
const _windows = _platform === "win32";
const _freebsd = _platform === "freebsd";
const _openbsd = _platform === "openbsd";
const _netbsd = _platform === "netbsd";
const _sunos = _platform === "sunos";

const winPrinterStatus = {
  1: "Other",
  2: "Unknown",
  3: "Idle",
  4: "Printing",
  5: "Warmup",
  6: "Stopped Printing",
  7: "Offline",
};

function parseLinuxCupsHeader(lines) {
  const result = {};
  if (lines && lines.length) {
    if (lines[0].indexOf(" CUPS v") > 0) {
      const parts = lines[0].split(" CUPS v");
      result.cupsVersion = parts[1];
    }
  }
  return result;
}

function parseLinuxCupsPrinter(lines) {
  const result = {};
  const printerId = getValue(lines, "PrinterId", " ");
  result.id = printerId ? parseInt(printerId, 10) : null;
  result.name = getValue(lines, "Info", " ");
  result.model = lines.length > 0 && lines[0] ? lines[0].split(" ")[0] : "";
  result.uri = getValue(lines, "DeviceURI", " ");
  result.uuid = getValue(lines, "UUID", " ");
  result.status = getValue(lines, "State", " ");
  result.local = getValue(lines, "Location", " ")
    .toLowerCase()
    .startsWith("local");
  result.default = null;
  result.shared = getValue(lines, "Shared", " ")
    .toLowerCase()
    .startsWith("yes");

  return result;
}

function parseLinuxLpstatPrinter(lines, id) {
  const result = {};
  result.id = id;
  result.name = getValue(lines, "Description", ":", true);
  result.model = lines.length > 0 && lines[0] ? lines[0].split(" ")[0] : "";
  result.uri = null;
  result.uuid = null;
  result.status =
    lines.length > 0 && lines[0]
      ? lines[0].indexOf(" idle") > 0
        ? "idle"
        : lines[0].indexOf(" printing") > 0
        ? "printing"
        : "unknown"
      : null;
  result.local = getValue(lines, "Location", ":", true)
    .toLowerCase()
    .startsWith("local");
  result.default = null;
  result.shared = getValue(lines, "Shared", " ")
    .toLowerCase()
    .startsWith("yes");

  return result;
}

function parseDarwinPrinters(printerObject, id) {
  const result = {};
  const uriParts = printerObject.uri.split("/");
  result.id = id;
  result.name = printerObject._name;
  result.model = uriParts.length ? uriParts[uriParts.length - 1] : "";
  result.uri = printerObject.uri;
  result.uuid = null;
  result.status = printerObject.status;
  result.local = printerObject.printserver === "local";
  result.default = printerObject.default === "yes";
  result.shared = printerObject.shared === "yes";

  return result;
}

function parseWindowsPrinters(lines, id) {
  const result = {};
  const status = parseInt(getValue(lines, "PrinterStatus", ":"), 10);

  result.id = id;
  result.name = getValue(lines, "name", ":");
  result.model = getValue(lines, "DriverName", ":");
  result.uri = null;
  result.uuid = null;
  result.status = winPrinterStatus[status] ? winPrinterStatus[status] : null;
  result.local = getValue(lines, "Local", ":").toUpperCase() === "TRUE";
  result.default = getValue(lines, "Default", ":").toUpperCase() === "TRUE";
  result.shared = getValue(lines, "Shared", ":").toUpperCase() === "TRUE";

  return result;
}

function printer(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = [];
      if (_linux || _freebsd || _openbsd || _netbsd) {
        let cmd = "cat /etc/cups/printers.conf 2>/dev/null";
        exec(cmd, function (error, stdout) {
          // printers.conf
          if (!error) {
            const parts = stdout.toString().split("<Printer ");
            const printerHeader = parseLinuxCupsHeader(parts[0]);
            for (let i = 1; i < parts.length; i++) {
              const printers = parseLinuxCupsPrinter(parts[i].split("\n"));
              if (printers.name) {
                printers.engine = "CUPS";
                printers.engineVersion = printerHeader.cupsVersion;
                result.push(printers);
              }
            }
          }
          if (result.length === 0) {
            if (_linux) {
              cmd = "export LC_ALL=C; lpstat -lp 2>/dev/null; unset LC_ALL";
              // lpstat
              exec(cmd, function (error, stdout) {
                const parts = ("\n" + stdout.toString()).split("\nprinter ");
                for (let i = 1; i < parts.length; i++) {
                  const printers = parseLinuxLpstatPrinter(
                    parts[i].split("\n"),
                    i
                  );
                  result.push(printers);
                }
              });
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
          } else {
            if (callback) {
              callback(result);
            }
            resolve(result);
          }
        });
      }
      if (_darwin) {
        let cmd = "system_profiler SPPrintersDataType -json";
        exec(cmd, function (error, stdout) {
          if (!error) {
            try {
              const outObj = JSON.parse(stdout.toString());
              if (
                outObj.SPPrintersDataType &&
                outObj.SPPrintersDataType.length
              ) {
                for (let i = 0; i < outObj.SPPrintersDataType.length; i++) {
                  const printer = parseDarwinPrinters(
                    outObj.SPPrintersDataType[i],
                    i
                  );
                  result.push(printer);
                }
              }
            } catch (e) {
              noop();
            }
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_windows) {
        powerShell(
          "Get-WmiObject Win32_Printer | select PrinterStatus,Name,DriverName,Local,Default,Shared | fl"
        ).then((stdout, error) => {
          if (!error) {
            const parts = stdout.toString().split(/\n\s*\n/);
            for (let i = 0; i < parts.length; i++) {
              const printer = parseWindowsPrinters(parts[i].split("\n"), i);
              if (printer.name || printer.model) {
                result.push(parseWindowsPrinters(parts[i].split("\n"), i));
              }
            }
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_sunos) {
        resolve(null);
      }
    });
  });
}

const _printer = printer;
export { _printer as printer };
