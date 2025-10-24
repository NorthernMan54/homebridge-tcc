/*jslint node: true */
'use strict';

/**
 * homebridge-tcc Plugin Entry Point
 *
 * This is the main entry point for the homebridge-tcc plugin.
 * It registers the TCC platform with Homebridge.
 *
 * Honeywell Total Connect Comfort support for Homebridge
 * https://github.com/thindiyeh/homebridge-tcc
 */

const { TccPlatform, PLUGIN_NAME, PLATFORM_NAME } = require('./platform');

module.exports = function (homebridge) {
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, TccPlatform);
};
