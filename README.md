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
* Honeywell's Prestige IAQ Thermostat (THX9421R5021WW) and it's accompanying Equipment Interface Module (THM5421R1021)

# Installation

1. Install homebridge using: npm install -g homebridge <br>
2. Install this plugin using npm install -g homebridge-tcc
3. Update your configuration file. See sample-config below for a sample.

## On Windows platforms

Please ensure the node-gyp is properly configured for use prior to installing.  Error messages like this may appear during installation if not.

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
* `sensors` - Enables temperature/humidity HomeKit sensors (useful for automations), options include: 
  * `none` - No sensors will be shown (this is default setting)
  * `all` - Enables all available temperature/humidity sensors
  * `inside` - Enables temperature and humidity sensors for each thermostat
  * `outside` - Enables a single set of outdoor temperature and humidity sensors
  * `advanced` -  Allows for granular control of which temperature/humidity sensors to show, requires `devices` option (see below)
* `debug` - Enables debug level logging from the plugin, defaults to `false`, to enable set to `true`
  
# Advanced settings

* Use with `"sensors": "advanced"` option above, allows for granular control over which sensors are shown by individual thermostat
* `devices` and `deviceID` - See example below for config directives, `deviceID` is obtained by looking at your Homebridge logs for TCC entries when you restart (alternatively, if you login to Honeywell's site, you can see the id when using links for each thermostat)
* `insideTemperature` - Enables thermostat temperature sensor in HomeKit, to enable set to `true` on each thermostat
* `outsideTemperature` - Enables outdoor temperature sensor in HomeKit, to enable set to `true` on each thermostat
* `insideHumidity` - Enables thermostat humidity sensor in HomeKit, to enable set to `true` on each thermostat
* `outsideHumidity` - Enables outdoor humidity sensor in HomeKit, to enable set to `true` on each thermostat

```
"platforms": [
       {
            "platform": "tcc",
            "name" : "Thermostat",
            "username" : ".....",
            "password" : ".....",
            "sensors" : "advanced",
            "devices": [{
                "deviceID": "3910306",
                "insideTemperature": true,
                "insideHumidity": true,
                "outsideTemperature": true,
                "outsideHumidity": true
            },
            {
                "deviceID": "3910307",
                "insideTemperature": true,
                "insideHumidity": true,
                "outsideTemperature": false,
                "outsideHumidity": false
            }]
        }
    ]
```

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
- jcgorla-dev - Validation of Honeywell's Prestige IAQ Thermostat
- kylerove - Added support for separate temperature / humidity sensors
