# homebridge-tcc


This is a plugin for Honeywell Total Connect Comfort. It is a partially-working
implementation into HomeKit. This plugin is work in progress. Help is appreciated!

# Installation

1. Install homebridge using: npm install -g homebridge <br>
2. Install this plugin using npm install -g homebridge-tcc
3. Update your configuration file. See sample-config below for a sample.

# Configuration

Configuration sample:

```
"platforms": [
       {
            "platform": "tcc",
            "name" : "Thermostat",
            "username" : ".....",
            "password" : ".....",
            "deviceID" : "...."
        },
    ]
```

- platform: tcc
- name: can be anything you want
- username: your Honeywell e-mail
- password: your Honeywell password
- deviceID: Your honeywell deviceID

# Roadmap

- Wire up set target temp, and set heat/cool switch

# Notes

It seems to be vitally important to set the right system time, especially on raspi!

# Credits

- luc-ass - Borrowed your homebridge-evohome plugin as a base to start from
- Dan / Ghostbit - Borrowed your python script for the page flow of the TCC website
