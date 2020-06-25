# Homebridge Sharp Serial

This Homebridge plugin enables control of Sharp Televisions using a serial connection.

## Compatibility

This should work with any Sharp TV that uses the following for serial control:

- Getting TV State: `POWR????`
- Turning on TV: `POWR1`
- Turning off TV: `POWR0`
- Getting Input State `IAVD?`
- Switching Input: `IAVD000X` where `X` is the input ID number (1-8 currently supported)