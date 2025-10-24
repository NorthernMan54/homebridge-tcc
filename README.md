# homebridge-tcc

[![NPM Downloads](https://img.shields.io/npm/dm/homebridge-tcc.svg?style=flat)](https://npmjs.org/package/homebridge-tcc)
[![Version](https://img.shields.io/npm/v/homebridge-tcc.svg)](https://www.npmjs.com/package/homebridge-tcc)

A feature-rich Homebridge plugin for **North America Honeywell Total Connect Comfort (TCC)** WiFi thermostats. Brings your Honeywell thermostat into Apple HomeKit with full temperature control, mode switching, and historical data logging.

> **Note**: This plugin is for the **North American** TCC site only. It does not work with the International Honeywell Total Connect Comfort site.

## Features

### Core Functionality
- ✅ **Full HomeKit Integration** - Control all thermostat functions through the Home app
- ✅ **Auto-Discovery** - Automatically discovers all thermostats on your TCC account
- ✅ **Multi-Thermostat Support** - Manage multiple zones/thermostats simultaneously
- ✅ **Temperature Control** - Set target temperature, heating/cooling thresholds
- ✅ **Humidity Monitoring** - View live indoor humidity directly on each thermostat
- ✅ **Mode Switching** - Off, Heat, Cool, and Auto modes
- ✅ **Emergency Heat Support** - Automatically remembers and uses your emergency heat preference
- ✅ **Real-time Updates** - See current temperature, humidity, and operating state

### Advanced Features
- 📊 **Historical Data** - Temperature and humidity history for Eve app and other compatible apps (via FakeGato)
- 🌡️ **Separate Sensors** - Optional independent temperature/humidity sensors for automations
- 💧 **Thermostat Humidity Characteristic** - HomeKit exposes indoor humidity even when extra sensors are disabled
- ⚡ **Smart Polling** - Optimized refresh with background polling for faster updates
- 🔄 **Automatic Recovery** - Handles network issues and API errors gracefully
- 🎯 **Precise Temperature** - Intelligent rounding for both Celsius and Fahrenheit units
- 🔧 **Permanent/Temporary Holds** - Choose between permanent holds or schedule-based operation
- 🌍 **Outdoor Sensors** - Track outdoor temperature and humidity
- ⚙️ **Auto Mode Support** - Full support for thermostats with auto heat/cool switching

## Compatibility

### Supported Thermostats

Tested and confirmed working with:
- RTH6580WF
- RTH8580WF
- RTH9580
- TH6320WF
- 9850
- MHK1
- Honeywell Prestige IAQ (THX9421R5021WW) with Equipment Interface Module (THM5421R1021)

> **Note**: Any Honeywell WiFi thermostat that works with the North American TCC app should work with this plugin.

### Requirements

- **Homebridge**: 1.6.0 or later (also supports Homebridge 2.0 beta)
- **Node.js**: 18.20.4+ | 20.15.1+ | 22.20.0+
- **Honeywell Account**: Active TCC account with thermostat(s) registered

## Installation

### Via Homebridge UI (Recommended)

1. Search for "homebridge-tcc" in the Homebridge UI
2. Click **Install**
3. Configure using the UI settings panel

### Via Command Line

```bash
npm install -g homebridge-tcc
```

### On Windows

Ensure `node-gyp` is properly configured before installing:

```bash
gyp ERR! find Python Python is not set from command line or npm configuration
```

If you see this error, follow the [node-gyp Windows setup guide](https://github.com/nodejs/node-gyp#on-windows).

## Configuration

### Basic Configuration (Minimum Required)

```json
{
  "platforms": [
    {
      "platform": "tcc",
      "name": "Thermostat",
      "username": "your-tcc-email@example.com",
      "password": "your-tcc-password"
    }
  ]
}
```

### Recommended Configuration

For better responsiveness and emergency heat support:

```json
{
  "platforms": [
    {
      "platform": "tcc",
      "name": "Thermostat",
      "username": "your-tcc-email@example.com",
      "password": "your-tcc-password",
      "refresh": 600,
      "backgroundRefresh": 180,
      "sensors": "all"
    }
  ]
}
```

### Full Configuration Example

```json
{
  "platforms": [
    {
      "platform": "tcc",
      "name": "Thermostat",
      "username": "your-tcc-email@example.com",
      "password": "your-tcc-password",
      "refresh": 600,
      "backgroundRefresh": 180,
      "usePermanentHolds": false,
      "sensors": "all",
      "storage": "fs",
      "debug": false
    }
  ]
}
```

## Configuration Options

### Required Settings

| Option | Type | Description |
|--------|------|-------------|
| `platform` | String | Must be `"tcc"` |
| `name` | String | Platform name (appears in logs only, not the thermostat name) |
| `username` | String | Your Honeywell TCC account email |
| `password` | String | Your Honeywell TCC account password |

### Optional Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `refresh` | Number | `600` | Main polling interval in seconds (10 minutes). **Minimum: 600** to avoid Honeywell rate limiting |
| `backgroundRefresh` | Number\|Boolean | `180` | Fast polling interval in seconds (3 minutes) for quicker updates. Must be less than `refresh`. Set to `false` or `0` to disable. **Minimum recommended: 60** |
| `usePermanentHolds` | Boolean | `false` | If `true`, temperature changes are permanent. If `false`, changes are temporary and resume schedule later |
| `sensors` | String | `"none"` | Enable additional temperature/humidity sensors. See [Sensor Options](#sensor-options) |
| `storage` | String | `"fs"` | History storage: `"fs"` (file system) or `"googleDrive"` |
| `debug` | Boolean | `false` | Enable detailed debug logging |

### Sensor Options

Control which temperature and humidity sensors appear in HomeKit:

| Value | Description |
|-------|-------------|
| `"none"` | No additional sensors (default) |
| `"all"` | All available sensors (inside + outside for all thermostats) |
| `"inside"` | Inside temperature and humidity for each thermostat |
| `"insideHumidity"` | Inside humidity only for each thermostat |
| `"outside"` | Single set of outdoor temperature and humidity sensors |

**Use Case**: Separate sensors are useful for HomeKit automations (e.g., "Turn on fan when humidity > 60%").

## How It Works

### Data Flow

```
Physical Thermostat ←→ Honeywell TCC Cloud ←→ Homebridge Plugin ←→ HomeKit
     (WiFi)                 (Internet)            (SOAP API)        (Home App)
```

1. **Your thermostat** communicates with Honeywell's cloud servers via WiFi
2. **This plugin** polls the Honeywell TCC API periodically (every 3-10 minutes)
3. **HomeKit** receives updates and sends commands through the plugin
4. **Changes** you make in the Home app are sent to the TCC API immediately
5. **Verification polling** occurs 30 seconds after changes to confirm success

### Polling Strategy

The plugin uses a dual-polling approach for optimal performance:

- **Main Poll** (default: 600s / 10 min)
  - Full data refresh for all thermostats
  - Updates all accessories and sensors
  - Comprehensive data validation

- **Background Refresh** (default: 180s / 3 min)
  - Quick individual thermostat snapshots
  - Faster detection of physical thermostat changes
  - Lower API overhead

- **Smart Verification** (30s after changes)
  - Confirms your changes were applied successfully
  - Automatic retry if needed
  - Prevents rate limiting

## Features Deep Dive

### Emergency Heat Mode

**Problem**: HomeKit doesn't have a separate emergency heat mode, but Honeywell thermostats do.

**Solution**: The plugin automatically tracks whether you last used emergency heat or regular heat on the physical thermostat.

#### How It Works

1. **You set emergency heat** on the physical thermostat
2. **Plugin detects it** during the next poll (3 min with backgroundRefresh, 10 min without)
3. **Preference is saved** for that specific thermostat
4. **When you set "Heat"** in the Home app, it uses emergency heat (not regular heat)
5. **Setting cool/off/auto and back to heat** still uses emergency heat
6. **Setting regular heat** on the physical thermostat switches the preference back

#### Per-Thermostat Memory

Each thermostat independently remembers its own heat mode preference. The preference persists across Homebridge restarts.

**Tip**: Enable `backgroundRefresh: 180` for faster detection (3 minutes vs 10 minutes).

### Temperature Handling

The plugin intelligently handles temperature precision:

#### Fahrenheit Thermostats
- Rounds to nearest whole number (as displayed on thermostat)
- Converts back to Celsius with 0.1° precision for HomeKit
- Prevents rounding inconsistencies between app and thermostat

#### Celsius Thermostats
- Uses 0.5° increments (standard for Celsius thermostats)
- Maintains precision throughout conversions

#### Example
```
You set 72°F in Home app
→ Plugin confirms "72°F" (not 71.9° or 72.1°)
→ Thermostat displays exactly 72°F
→ No confusion or rounding errors
```

### Permanent vs Temporary Holds

**Temporary Holds** (default, `usePermanentHolds: false`):
- Changes expire after a period (usually next schedule change)
- Thermostat returns to programmed schedule
- Good for manual adjustments without disrupting schedule

**Permanent Holds** (`usePermanentHolds: true`):
- Changes stay until manually changed again
- Overrides thermostat schedule completely
- Good for HomeKit automations replacing thermostat schedule

### History & Graphing

The plugin uses FakeGato to provide historical data for:
- Current temperature
- Target temperature (setpoint)
- Heating/cooling state (valve position)
- Indoor humidity
- Outdoor temperature and humidity

**Compatible Apps**:
- Eve for HomeKit (best support)
- Home+ app
- Controller for HomeKit

**Storage Options**:
- `"fs"` - Local file system (default, most reliable)
- `"googleDrive"` - Google Drive sync (requires additional setup)

## Troubleshooting

### Thermostats Not Appearing

1. **Check credentials**: Verify your TCC username/password
2. **Check Homebridge logs**: Look for login errors
3. **Verify TCC account**: Ensure thermostats appear in the TCC app/website
4. **Restart Homebridge**: Sometimes needed after first install

### Temperature Changes Not Working

1. **Check hold type**: Try toggling `usePermanentHolds`
2. **Check logs**: Look for API errors
3. **Wait for verification**: Changes take ~30 seconds to verify
4. **Rate limiting**: If changing too frequently, wait 60 seconds

### Slow Updates from Physical Thermostat

1. **Enable background refresh**: Set `backgroundRefresh: 180`
2. **Lower refresh interval**: Try `refresh: 600` (don't go below 600)
3. **Check network**: Ensure thermostat has good WiFi signal
4. **Wait**: Cloud-based updates can take 3-10 minutes

### "No Response" in Home App

**Causes**:
- Homebridge server down/restarting
- Internet connection lost
- Honeywell servers down
- Invalid session (will auto-recover)

**Solutions**:
1. Check Homebridge is running
2. Check internet connection
3. Check Honeywell TCC website/app status
4. Wait 1-2 minutes for automatic retry

### High CPU Usage

1. **Disable debug logging**: Set `debug: false`
2. **Increase polling interval**: Use `refresh: 600` (minimum)
3. **Disable sensors**: Set `sensors: "none"` if not needed
4. **Check for errors**: Excessive errors cause retry loops

### Emergency Heat Not Working

1. **Enable background refresh**: Set `backgroundRefresh: 180` for faster detection
2. **Set emergency heat on physical thermostat first**: Plugin learns from physical changes
3. **Wait for poll**: Allow 3-10 minutes for plugin to detect
4. **Check logs with debug**: Set `debug: true` to see SystemSwitchPosition values
5. **Then test from Home app**: After detection, Heat mode will use emergency heat

## Advanced Usage

### Debug Logging

Enable detailed logging to troubleshoot issues:

```json
{
  "platform": "tcc",
  "debug": true
}
```

Then check logs:
```bash
# View Homebridge logs
journalctl -u homebridge -f

# Or if running manually
DEBUG=tcc* homebridge
```

### Multiple TCC Accounts

You can configure multiple TCC accounts (useful for managing properties):

```json
{
  "platforms": [
    {
      "platform": "tcc",
      "name": "Home Thermostats",
      "username": "home@example.com",
      "password": "password1"
    },
    {
      "platform": "tcc",
      "name": "Office Thermostats",
      "username": "office@example.com",
      "password": "password2"
    }
  ]
}
```

### Performance Tuning

For **faster responsiveness** (uses more API calls):
```json
{
  "refresh": 600,
  "backgroundRefresh": 120
}
```

For **minimal API usage** (slower but less traffic):
```json
{
  "refresh": 600,
  "backgroundRefresh": false
}
```

**Balanced** (recommended):
```json
{
  "refresh": 600,
  "backgroundRefresh": 180
}
```

### Using with Automations

**Recommended Settings for Automations**:
```json
{
  "usePermanentHolds": true,
  "sensors": "inside",
  "backgroundRefresh": 180
}
```

**Why**:
- `usePermanentHolds: true` - Automations override schedule
- `sensors: "inside"` - Separate sensors for humidity-based automations
- `backgroundRefresh: 180` - Faster detection of manual changes

**Example Automation Ideas**:
- "Turn on heat when I arrive home"
- "Set to 68°F at bedtime"
- "Turn off when outdoor temp > 75°F"
- "Turn on fan when humidity > 60%"

## API Rate Limiting

Honeywell TCC enforces rate limiting to prevent excessive API calls:

- **Minimum refresh interval**: 600 seconds (10 minutes)
- **Background refresh minimum**: 60 seconds (recommended 180)
- **Changes are immediate**: No delay for user-initiated changes
- **Smart verification**: 30-second delay after changes

**Do not** set `refresh` below 600 seconds or you may get temporarily blocked.

## Technical Details

### Architecture

- **Language**: JavaScript (Node.js)
- **Protocol**: SOAP over HTTPS
- **API**: Honeywell TCC MobileV2 API
- **Queue**: Sequential request processing (prevents race conditions)
- **Session Management**: Automatic login/re-login
- **Error Handling**: Retry logic with exponential backoff

### Dependencies

- `easy-soap-request` - SOAP client
- `fast-xml-parser` - XML parsing
- `fakegato-history` - Historical data for Eve app
- `homebridge-lib` - Eve custom characteristics
- `moment` - Timestamp handling
- `p-queue` - Request queue management
- `debug` - Debug logging

### Data Validation

The plugin validates all thermostat data to prevent:
- Invalid temperature ranges
- Corrupted state values
- Missing required fields
- Network/API glitches

## Known Limitations

1. **Cloud-dependent**: Requires internet connection and Honeywell servers to be operational
2. **Polling-based**: Not instant; changes take 3-10 minutes to appear
3. **No push notifications**: Plugin must poll for updates (API limitation)
4. **North America only**: International TCC site uses different API
5. **No direct WiFi**: Can't communicate directly with thermostat hardware
6. **Rate limiting**: Minimum 10-minute refresh interval

## FAQ

**Q: Why does it take so long to see changes from the physical thermostat?**
A: The plugin polls the Honeywell cloud API every 3-10 minutes. Enable `backgroundRefresh: 180` for faster 3-minute updates.

**Q: Can I control my thermostat when away from home?**
A: Yes! As long as Homebridge has internet access and your phone can reach HomeKit, remote control works.

**Q: Does this work with Siri?**
A: Yes! "Hey Siri, set the thermostat to 72" or "Hey Siri, turn on the heat" both work.

**Q: Will this drain my thermostat battery?**
A: No. WiFi thermostats are powered by your HVAC system's C-wire, not batteries.

**Q: Can I use this with Google Home or Alexa?**
A: Not directly, but you can bridge HomeKit to them using additional software (Homebridge integrations).

**Q: What happens if Honeywell's servers go down?**
A: The plugin will show "No Response" in HomeKit. Your physical thermostat continues working on its schedule.

**Q: Is my password secure?**
A: Your password is stored in Homebridge's config file. Secure your Homebridge server appropriately. The plugin communicates with Honeywell over HTTPS.

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test thoroughly with your thermostat
4. Submit a pull request

**Areas needing help**:
- Testing with different thermostat models
- International TCC API support
- Documentation improvements
- Bug fixes

## Testing

This plugin includes a comprehensive test suite with 50 tests covering all functionality, especially emergency heat mode, humidity reporting, mode transitions, and persistence across restarts.

### Running Tests

**Run all tests:**
```bash
npm test
```

**Run tests with coverage report:**
```bash
npm run test-coverage
```

**Run specific test file:**
```bash
npm test emergencyHeat
# or
npm test cachePreservation
```

**Watch mode (for development):**
```bash
npx jest --watch
```

### Test Coverage

The test suite includes:

- ✅ **Emergency heat mode tracking** - Verifies emergency vs regular heat preference is tracked
- ✅ **Mode transitions** - All combinations tested (Heat→Off→Heat, Auto→Off→Heat, etc.)
- ✅ **Cache preservation** - Ensures preferences persist across polling cycles
- ✅ **Persistence after restart** - Preferences survive Homebridge restarts
- ✅ **Multi-thermostat scenarios** - Independent preference tracking per thermostat
- ✅ **Edge cases** - Handles undefined values, invalid data, and error conditions
- ✅ **Data validation** - Ensures thermostat data integrity

### Test Results

```
Test Suites: 2 passed, 2 total
Tests:       50 passed, 50 total
Time:        ~0.5 seconds
```

### Test Files

- `__tests__/emergencyHeat.test.js` - Emergency heat functionality (33 tests)
- `__tests__/cachePreservation.test.js` - Cache preservation logic (15 tests)
- `__tests__/humidityMapping.test.js` - Ensures humidity values reach HomeKit accessories

For detailed test documentation, see [TESTING.md](TESTING.md).

### Contributing Tests

When adding features:
1. Add corresponding test cases
2. Ensure all tests pass: `npm test`
3. Maintain test coverage: `npm run test-coverage`
4. Document test scenarios in TESTING.md

## Support

- **Issues**: [GitHub Issues](https://github.com/thindiyeh/homebridge-tcc/issues)
- **Documentation**: This README
- **Homebridge**: [Homebridge Discord](https://discord.gg/kqNCe2D)

## License

ISC License - see package.json for details

## Credits

This plugin is built on the work of many contributors:

- **NorthernMan54** - Original homebridge-tcc plugin foundation
- **luc-ass** - homebridge-evohome plugin base structure
- **Dan/Ghostbit** - Python TCC website flow implementation
- **bwdeleeuw** - Fahrenheit testing and enhancements
- **devbymike** - RTH9580 validation
- **djsomi** - International TCC site investigation
- **gsulshski** - TH6320WF validation
- **l3nticular** - Mode 7 support
- **simont77** - FakeGato History integration
- **hakusaro** - Permanent temperature hold support
- **jcgorla-dev** - Prestige IAQ validation
- **kylerove** - Indoor/outdoor sensor support
- **johnjensenish** - Enhanced sensor support
- **thindiyeh** - Current maintainer, emergency heat support, background refresh, smart polling, Fahrenheit rounding fixes, error recovery improvements

## Version History

See [package.json](package.json) for current version.

**Recent Improvements**:
- ✅ Emergency heat mode tracking
- ✅ Smart verification polling after changes
- ✅ Background refresh for faster updates
- ✅ Improved Fahrenheit temperature rounding
- ✅ Enhanced error recovery and validation
- ✅ Optimistic updates when server is slow
- ✅ Better session management
- ✅ Comprehensive data validation

---

**Made with ❤️ for the Homebridge community**
