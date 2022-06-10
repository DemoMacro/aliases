import { exec } from "child_process";
// const execSync = require('child_process').execSync;
import { getValue, powerShell } from "./util";
// const fs = require('fs');

let _platform = process.platform;

const _linux = _platform === "linux" || _platform === "android";
const _darwin = _platform === "darwin";
const _windows = _platform === "win32";
const _freebsd = _platform === "freebsd";
const _openbsd = _platform === "openbsd";
const _netbsd = _platform === "netbsd";
const _sunos = _platform === "sunos";

function getLinuxUsbType(type, name) {
  let result = type;
  const str = (name + " " + type).toLowerCase();
  if (str.indexOf("camera") >= 0) {
    result = "Camera";
  } else if (str.indexOf("hub") >= 0) {
    result = "Hub";
  } else if (str.indexOf("keybrd") >= 0) {
    result = "Keyboard";
  } else if (str.indexOf("keyboard") >= 0) {
    result = "Keyboard";
  } else if (str.indexOf("mouse") >= 0) {
    result = "Mouse";
  } else if (str.indexOf("stora") >= 0) {
    result = "Storage";
  } else if (str.indexOf("mic") >= 0) {
    result = "Microphone";
  } else if (str.indexOf("headset") >= 0) {
    result = "Audio";
  } else if (str.indexOf("audio") >= 0) {
    result = "Audio";
  }

  return result;
}

function parseLinuxUsb(usb) {
  const result = {};
  const lines = usb.split("\n");
  if (lines && lines.length && lines[0].indexOf("Device") >= 0) {
    const parts = lines[0].split(" ");
    result.bus = parseInt(parts[0], 10);
    if (parts[2]) {
      result.deviceId = parseInt(parts[2], 10);
    } else {
      result.deviceId = null;
    }
  } else {
    result.bus = null;
    result.deviceId = null;
  }
  const idVendor = getValue(lines, "idVendor", " ", true).trim();
  let vendorParts = idVendor.split(" ");
  vendorParts.shift();
  const vendor = vendorParts.join(" ");

  const idProduct = getValue(lines, "idProduct", " ", true).trim();
  let productParts = idProduct.split(" ");
  productParts.shift();
  const product = productParts.join(" ");

  const interfaceClass = getValue(lines, "bInterfaceClass", " ", true).trim();
  let interfaceClassParts = interfaceClass.split(" ");
  interfaceClassParts.shift();
  const usbType = interfaceClassParts.join(" ");

  const iManufacturer = getValue(lines, "iManufacturer", " ", true).trim();
  let iManufacturerParts = iManufacturer.split(" ");
  iManufacturerParts.shift();
  const manufacturer = iManufacturerParts.join(" ");

  result.id =
    (idVendor.startsWith("0x") ? idVendor.split(" ")[0].substr(2, 10) : "") +
    ":" +
    (idProduct.startsWith("0x") ? idProduct.split(" ")[0].substr(2, 10) : "");
  result.name = product;
  result.type = getLinuxUsbType(usbType, product);
  result.removable = null;
  result.vendor = vendor;
  result.manufacturer = manufacturer;
  result.maxPower = getValue(lines, "MaxPower", " ", true);
  result.serialNumber = null;

  return result;
}

// bus
// deviceId
// id
// name(product)
// type(bInterfaceClass)
// removable / hotplug
// vendor
// manufacturer
// maxpower(linux)

function getDarwinUsbType(name) {
  let result = "";
  if (name.indexOf("camera") >= 0) {
    result = "Camera";
  } else if (name.indexOf("touch bar") >= 0) {
    result = "Touch Bar";
  } else if (name.indexOf("controller") >= 0) {
    result = "Controller";
  } else if (name.indexOf("headset") >= 0) {
    result = "Audio";
  } else if (name.indexOf("keyboard") >= 0) {
    result = "Keyboard";
  } else if (name.indexOf("trackpad") >= 0) {
    result = "Trackpad";
  } else if (name.indexOf("sensor") >= 0) {
    result = "Sensor";
  } else if (name.indexOf("bthusb") >= 0) {
    result = "Bluetooth";
  } else if (name.indexOf("bth") >= 0) {
    result = "Bluetooth";
  } else if (name.indexOf("rfcomm") >= 0) {
    result = "Bluetooth";
  } else if (name.indexOf("usbhub") >= 0) {
    result = "Hub";
  } else if (name.indexOf(" hub") >= 0) {
    result = "Hub";
  } else if (name.indexOf("mouse") >= 0) {
    result = "Mouse";
  } else if (name.indexOf("mic") >= 0) {
    result = "Microphone";
  } else if (name.indexOf("removable") >= 0) {
    result = "Storage";
  }
  return result;
}

function parseDarwinUsb(usb, id) {
  const result = {};
  result.id = id;

  usb = usb.replace(/ \|/g, "");
  usb = usb.trim();
  let lines = usb.split("\n");
  lines.shift();
  try {
    for (let i = 0; i < lines.length; i++) {
      lines[i] = lines[i].trim();
      lines[i] = lines[i].replace(/=/g, ":");
      if (
        lines[i] !== "{" &&
        lines[i] !== "}" &&
        lines[i + 1] &&
        lines[i + 1].trim() !== "}"
      ) {
        lines[i] = lines[i] + ",";
      }
      lines[i] = lines[i].replace(": Yes,", ': "Yes",');
      lines[i] = lines[i].replace(": No,", ': "No",');
    }
    const usbObj = JSON.parse(lines.join("\n"));
    const removableDrive =
      usbObj["Built-In"].toLowerCase() !== "yes" &&
      usbObj["non-removable"].toLowerCase() === "no";

    result.bus = null;
    result.deviceId = null;
    result.id = usbObj["USB Address"] || null;
    result.name =
      usbObj["kUSBProductString"] || usbObj["USB Product Name"] || null;
    result.type = getDarwinUsbType(
      (
        usbObj["kUSBProductString"] ||
        usbObj["USB Product Name"] ||
        ""
      ).toLowerCase() + (removableDrive ? " removable" : "")
    );
    result.removable = usbObj["non-removable"].toLowerCase() === "no";
    result.vendor =
      usbObj["kUSBVendorString"] || usbObj["USB Vendor Name"] || null;
    result.manufacturer =
      usbObj["kUSBVendorString"] || usbObj["USB Vendor Name"] || null;
    result.maxPower = null;
    result.serialNumber = usbObj["kUSBSerialNumberString"] || null;

    if (result.name) {
      return result;
    } else {
      return null;
    }
  } catch (e) {
    return null;
  }
}

// function getWindowsUsbType(service) {
//   let result = ''
//   if (service.indexOf('usbhub3') >= 0) { result = 'Hub'; }
//   else if (service.indexOf('usbstor') >= 0) { result = 'Storage'; }
//   else if (service.indexOf('hidusb') >= 0) { result = 'Input'; }
//   else if (service.indexOf('usbccgp') >= 0) { result = 'Controller'; }
//   else if (service.indexOf('usbxhci') >= 0) { result = 'Controller'; }
//   else if (service.indexOf('usbehci') >= 0) { result = 'Controller'; }
//   else if (service.indexOf('kbdhid') >= 0) { result = 'Keyboard'; }
//   else if (service.indexOf('keyboard') >= 0) { result = 'Keyboard'; }
//   else if (service.indexOf('pointing') >= 0) { result = 'Mouse'; }
//   else if (service.indexOf('disk') >= 0) { result = 'Storage'; }
//   else if (service.indexOf('usbhub') >= 0) { result = 'Hub'; }
//   else if (service.indexOf('bthusb') >= 0) { result = ''; }
//   else if (service.indexOf('bth') >= 0) { result = ''; }
//   else if (service.indexOf('rfcomm') >= 0) { result = ''; }
//   return result;
// }

function getWindowsUsbTypeCreation(creationclass, name) {
  let result = "";
  if (name.indexOf("storage") >= 0) {
    result = "Storage";
  } else if (name.indexOf("speicher") >= 0) {
    result = "Storage";
  } else if (creationclass.indexOf("usbhub") >= 0) {
    result = "Hub";
  } else if (creationclass.indexOf("storage") >= 0) {
    result = "Storage";
  } else if (creationclass.indexOf("usbcontroller") >= 0) {
    result = "Controller";
  } else if (creationclass.indexOf("keyboard") >= 0) {
    result = "Keyboard";
  } else if (creationclass.indexOf("pointing") >= 0) {
    result = "Mouse";
  } else if (creationclass.indexOf("disk") >= 0) {
    result = "Storage";
  }
  return result;
}

function parseWindowsUsb(lines, id) {
  const usbType = getWindowsUsbTypeCreation(
    getValue(lines, "CreationClassName", ":").toLowerCase(),
    getValue(lines, "name", ":").toLowerCase()
  );

  if (usbType) {
    const result = {};
    result.bus = null;
    result.deviceId = getValue(lines, "deviceid", ":");
    result.id = id;
    result.name = getValue(lines, "name", ":");
    result.type = usbType;
    result.removable = null;
    result.vendor = null;
    result.manufacturer = getValue(lines, "Manufacturer", ":");
    result.maxPower = null;
    result.serialNumber = null;

    return result;
  } else {
    return null;
  }
}

function usb(callback) {
  return new Promise((resolve) => {
    process.nextTick(() => {
      let result = [];
      if (_linux) {
        const cmd = "export LC_ALL=C; lsusb -v 2>/dev/null; unset LC_ALL";
        exec(cmd, { maxBuffer: 1024 * 1024 * 128 }, function (error, stdout) {
          if (!error) {
            const parts = ("\n\n" + stdout.toString()).split("\n\nBus ");
            for (let i = 1; i < parts.length; i++) {
              const usb = parseLinuxUsb(parts[i]);
              result.push(usb);
            }
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_darwin) {
        let cmd = "ioreg -p IOUSB -c AppleUSBRootHubDevice -w0 -l";
        exec(cmd, { maxBuffer: 1024 * 1024 * 128 }, function (error, stdout) {
          if (!error) {
            const parts = stdout.toString().split(" +-o ");
            for (let i = 1; i < parts.length; i++) {
              const usb = parseDarwinUsb(parts[i]);
              if (usb) {
                result.push(usb);
              }
            }
            if (callback) {
              callback(result);
            }
            resolve(result);
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });
      }
      if (_windows) {
        powerShell(
          'Get-WmiObject CIM_LogicalDevice | where { $_.Description -match "USB"} | select Name,CreationClassName,DeviceId,Manufacturer | fl'
        ).then((stdout, error) => {
          if (!error) {
            const parts = stdout.toString().split(/\n\s*\n/);
            for (let i = 0; i < parts.length; i++) {
              const usb = parseWindowsUsb(parts[i].split("\n"), i);
              if (usb) {
                result.push(usb);
              }
            }
          }
          if (callback) {
            callback(result);
          }
          resolve(result);
        });

        // util.powerShell("gwmi Win32_USBControllerDevice |\%{[wmi]($_.Dependent)}").then(data => {

        //   const parts = data.toString().split(/\n\s*\n/);
        //   for (let i = 0; i < parts.length; i++) {
        //     const usb = parseWindowsUsb(parts[i].split('\n'), i)
        //     if (usb) {
        //       result.push(usb)
        //     }
        //   }
        //   if (callback) {
        //     callback(result);
        //   }
        //   resolve(result);
        // });
      }
      if (_sunos || _freebsd || _openbsd || _netbsd) {
        resolve(null);
      }
    });
  });
}

const _usb = usb;
export { _usb as usb };
