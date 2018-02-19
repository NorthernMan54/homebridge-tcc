# homebridge-tcc

[![NPM Downloads](https://img.shields.io/npm/dm/homebridge-dht.svg?style=flat)](https://npmjs.org/package/homebridge-tcc)

This is a plugin for North America Honeywell Total Connect Comfort site. It is a partially-working
implementation into HomeKit. This plugin is work in progress. Help is appreciated!  Please note it does not work with the International Honeywell Total Connect Comfort site. Historical display of temperature data is available via HomeKit apps thats support graphing.

# Devices Tested With

* RTH8580WF
* RTH9580
* TH6320WF
* 9850
* MHK1

# Installation

1. Install homebridge using: npm install -g homebridge <br>
2. Install this plugin using npm install -g homebridge-tcc
3. Update your configuration file. See sample-config below for a sample.

# Configuration Sample

```
"platforms": [
       {
            "platform": "tcc",
            "name" : "Thermostat",
            "username" : ".....",
            "password" : ".....",
            "devices" : [
                  {"deviceID": "1234567","name": "Other Floor"},
                  {"deviceID": "abcdefg","name": "Main Floor"}
          	]
        },
    ]
```

- platform: tcc
- name: can be anything you want
- username: your Honeywell e-mail
- password: your Honeywell password
- deviceID: Your honeywell deviceID Go to the Honeywell Total Connect Comfort website, log in and open your
device. Now look in the address bar and you will see something like:

https://mytotalconnectcomfort.com/portal/Device/Control/1234567

The last part is your Device ID.

# Optional settings

* `refresh` - Data polling interval in seconds, defaults to 60 seconds
* `storage` - Storage of chart graphing data for history graphing, either fs or googleDrive, defaults to fs

# Roadmap

- Need to add throttling around temperature changes

# Notes

It seems to be vitally important to set the right system time, especially on raspi!

# Credits

- luc-ass - Borrowed your homebridge-evohome plugin as a base to start from
- Dan / Ghostbit - Borrowed your python script for the page flow of the TCC website
- bwdeleeuw - Fahrenheit testing and other enhancements
- devbymike - Validation of RTH9580
- djsomi - Investigation into international TCC site
- gsulshski - Validation of TH6320WF
- l3nticular - Support for Mode 7
- simont77 - FakeGato History
