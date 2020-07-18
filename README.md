# homebridge-tcc

[![NPM Downloads](https://img.shields.io/npm/dm/homebridge-tcc.svg?style=flat)](https://npmjs.org/package/homebridge-tcc)

This is a plugin for North America Honeywell Total Connect Comfort site. It is a partially-working
implementation into HomeKit. This plugin is work in progress. Help is appreciated!  Please note it does not work with the International Honeywell Total Connect Comfort site. Historical display of temperature data is available via HomeKit apps thats support graphing.

Plugin will discover your thermostats and create one for each connected to your TCC account.

# Devices Tested With

* RTH6580WF
* RTH8580WF
* RTH9580
* TH6320WF
* 9850
* MHK1

# Installation

1. Install homebridge using: npm install -g homebridge <br>
2. Install this plugin using npm install -g homebridge-tcc
3. Update your configuration file. See sample-config below for a sample.

## On Windows platforms

Please ensure the node-gyp is properly configured for use prior to installing.  Error messages like this may appear during installtion if not.

```
gyp ERR! find Python Python is not set from command line or npm configuration
```

To resolve the issue, please follow the steps here. https://github.com/nodejs/node-gyp#on-windows

# Configuration Sample

```
"platforms": [
       {
            "platform": "tcc",
            "name" : "Thermostat",
            "username" : ".....",
            "password" : ".....",
        }
    ]
```

- platform: tcc
- name: can be anything you want, this is only used in the homebridge logs and is not the thermostat name
- username: your Honeywell e-mail
- password: your Honeywell password

# Optional settings

* `refresh` - Data polling interval in seconds, defaults to 60 seconds
* `storage` - Storage of chart graphing data for history graphing, either fs or googleDrive, defaults to fs
* `usePermanentHolds` - If set to `true`, temperature changes will be set as permanent holds, rather than temporary holds. This will allow you to use HomeKit automations to completely replace your thermostat's schedule. If set to `false`, the temperature changes will expire after a certain period of time and resume your normal schedule. By default, this is off.
* `debug` - Enables debug level logging from the plugin, defaults to `false`, to enable set to `true`

# Credits

- luc-ass - Borrowed your homebridge-evohome plugin as a base to start from
- Dan / Ghostbit - Borrowed your python script for the page flow of the TCC website
- bwdeleeuw - Fahrenheit testing and other enhancements
- devbymike - Validation of RTH9580
- djsomi - Investigation into international TCC site
- gsulshski - Validation of TH6320WF
- l3nticular - Support for Mode 7
- simont77 - FakeGato History
- hakusaro - Added support for permanent temperature holds.
