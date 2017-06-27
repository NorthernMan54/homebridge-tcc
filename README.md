# homebridge-tcc

This is a plugin for North America Honeywell Total Connect Comfort site. It is a partially-working
implementation into HomeKit. This plugin is work in progress. Help is appreciated!  Please note it does not work with the International Honeywell Total Connect Comfort site.

# Devices Tested With

* RTH8580WF
* RTH9580

* This plugin not work with the international

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
- debug: optional parameter, will return details in log around response from TCC,
use full for debugging no response errors.
- refresh: How often the data is refreshed from the TCC website, in seconds.  Defaults to 60

# Roadmap

- Need to add throttling around temperature changes

# Notes

It seems to be vitally important to set the right system time, especially on raspi!

# Credits

- luc-ass - Borrowed your homebridge-evohome plugin as a base to start from
- Dan / Ghostbit - Borrowed your python script for the page flow of the TCC website
- bwdeleeuw - Fahrenheit testing and other enhancements
- devbymike - Validation of RTH9580
