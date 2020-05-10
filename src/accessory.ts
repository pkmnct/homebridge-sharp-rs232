import { API, AccessoryConfig, AccessoryPlugin, Logging, Service, CharacteristicEventTypes, CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue } from 'homebridge';
import SerialPort from 'serialport';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const Readline = require('@serialport/parser-readline');

export class SharpRS232 implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;

  private readonly switchService: Service;
  private readonly informationService: Service;

  private readonly api: API;
  private readonly manufacturer: string;
  private readonly model: string;
  private readonly path: string;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;

    this.name = config.name || 'Sharp TV';
    this.manufacturer = config.manufacturer || 'Sharp';
    this.model = config.model || 'Unknown';
    this.path = config.path || '/dev/ttyUSB0';

    this.log.debug('Sharp RS232 Plugin Loaded');

    this.informationService = new this.api.hap.Service.AccessoryInformation()
      .setCharacteristic(this.api.hap.Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(this.api.hap.Characteristic.Model, this.model);

    // create a new "Switch" service
    this.switchService = new this.api.hap.Service.Switch(this.name);

    // link methods used when getting or setting the state of the service 
    this.switchService.getCharacteristic(this.api.hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, this.getOnHandler.bind(this))   // bind to getOnHandler method below
      .on(CharacteristicEventTypes.SET, this.setOnHandler.bind(this));  // bind to setOnHandler method below
  }

  /**
   * This must return an array of the services to expose.
   * This method must be named "getServices".
   */
  getServices() {
    return [
      this.informationService,
      this.switchService,
    ];
  }

  getOnHandler(callback: CharacteristicGetCallback) {
    this.log.info('Getting switch state');

    const handleError = (error: Error | null | undefined) => {
      if (error) {
        this.log.error(error.message);
        callback(error, false);
      }
    };

    const port = new SerialPort(this.path, {
      baudRate: 9600,
    }, handleError);

    const parser = port.pipe(new Readline({
      delimiter: '\r',
    }));

    parser.on('data', (data: string) => {
      this.log.info('Got data', data);
      port.close(handleError);

      if (data.includes('ERR')) {
        callback (new Error('Serial command returned ERR'), false);
      } else {
        const value = data.includes('1') ? true : false;
  
        // the first argument of the callback should be null if there are no errors
        // the second argument contains the current status of the device to return.
        callback(null, value);
      }
    });

    port.write('POWR????\r', handleError);
  }

  setOnHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.log.info('Setting switch state to:', value);

    const handleError = (error: Error | null | undefined) => {
      if (error) {
        this.log.error(error.message);
        callback(error);
      }
    };

    const port = new SerialPort(this.path, {
      baudRate: 9600,
    }, handleError);

    const parser = port.pipe(new Readline({
      delimiter: '\r',
    }));

    parser.on('data', (data: string) => {
      this.log.info('Got data', data);
      port.close(handleError);

      if (data.includes('ERR')) {
        callback (new Error('Serial command returned ERR'));
      } else {  
        // the first argument of the callback should be null if there are no errors
        callback(null);
      }
    });

    const command = value ? 'POWR0001\r' : 'POWR0000\r';

    port.write(command, handleError);
  }
}
