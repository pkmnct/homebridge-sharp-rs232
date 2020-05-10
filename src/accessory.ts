import { API, AccessoryConfig, AccessoryPlugin, Logging, Service, CharacteristicEventTypes, CharacteristicGetCallback, CharacteristicSetCallback, CharacteristicValue } from 'homebridge';
import SerialPort from 'serialport';

export class SharpRS232 implements AccessoryPlugin {
  private readonly log: Logging;
  private readonly name: string;

  private readonly switchService: Service;
  private readonly informationService: Service;

  private readonly api: API;
  private readonly manufacturer: string;
  private readonly model: string;
  private readonly path: string;

  private port: SerialPort;
  private parser: SerialPort.parsers.Readline;
  private sendCommand: Function;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;

    this.name = config.name || 'Sharp TV';
    this.manufacturer = config.manufacturer || 'Sharp';
    this.model = config.model || 'Unknown';
    this.path = config.path || '/dev/ttyUSB0';

    this.port = new SerialPort(this.path, {
      baudRate: 9600,
      autoOpen: false,
    }, (error: Error | null | undefined) => {
      if (error) {
        this.log.error(error.message);
      }
    });

    this.parser = this.port.pipe(new SerialPort.parsers.Readline({
      delimiter: '\r',
    }));

    this.sendCommand = (command: string, callback: (error: null | Error, data: null | string) => void) => {
      this.parser.on('data', (data: string) => {
        this.log.info('Got data', data);
        callback(null, data);
      });

      const sendCommand = () => this.port.write(command, (error) => {
        if (error) {
          this.log.error(error.message);
          callback(error, null);
        }
      });

      if (this.port.isOpen) {
        sendCommand();
      } else {
        this.port.open((error) => {
          if (error) {
            this.log.error(error.message);
          } else {
            sendCommand();
          }
        });
      }
    };

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

    this.sendCommand('POWR????\r', (error: null | Error, data: null | string) => {
      if (error || !data) {
        callback(error, false);
      } else {
        if (data.includes('1') || data.includes('0')) {
          const value = data.includes('1') ? true : false;
    
          // the first argument of the callback should be null if there are no errors
          // the second argument contains the current status of the device to return.
          callback(null, value);
        } else {
          const errorMessage = `Serial command returned '${data}'`;
          this.log.error(errorMessage);
          callback (new Error(errorMessage), false);
        }
      }
    });
  }

  setOnHandler(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.log.info('Setting switch state to:', value);

    const command = value ? 'POWR0   \r' : 'POWR0   \r';

    this.sendCommand(command, (error: null | Error, data: null | string) => {
      if (error || !data) {
        callback(error);
      } else {
        if (data.includes('OK')) {
        // the first argument of the callback should be null if there are no errors
          callback(null);
        } else {
          const errorMessage = `Serial command returned '${data}'`;
          this.log.error(errorMessage);
          callback (new Error(errorMessage));
        }
      }
    });
  }
}
