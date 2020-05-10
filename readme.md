# Homebridge Sharp RS232

This Homebridge plugin enables control of Sharp Televisions using a serial connection.

## Compatibility

This should work with any Sharp TV that uses the following for serial control:

Getting TV State: `POWR????`
Turning on TV: `POWR1   `
Turning off TV: `POWR0   `

## Future
I may look into implementing this as a [Television Service](https://developers.homebridge.io/#/service/Television) in the future. It is not a high priority due to my personal use of the plugin.